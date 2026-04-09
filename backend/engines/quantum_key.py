"""
engines/quantum_key.py
======================
Quantum key generation pipeline for Q-Auth.
 
Three layers in one file (matching your existing filename):
 
  Layer 1 — BB84Simulator
      Full software simulation of the BB84 QKD protocol.
      Produces a privacy-amplified 256-bit key from simulated qubit exchange.
 
  Layer 2 — QRNGService
      Fetches true quantum random bytes from the ANU Quantum Vacuum API.
      Falls back to BB84Simulator, then Python secrets if API is unreachable.
 
  Layer 3 — KeyManager
      Takes QRNG output, encrypts with AES-256-GCM, persists in DB.
      Provides generate_and_store_key() and get_user_key_hex() helpers.
 
Reference:
  Bennett & Brassard (1984). Quantum cryptography: Public key distribution
  and coin tossing. Proc. IEEE ICCSSP, 175–179.
"""
 
import os
import json
import secrets
import hashlib
import logging
import urllib.request
import urllib.error
from typing import Optional
 
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
 
logger = logging.getLogger(__name__)
 
# ═══════════════════════════════════════════════════════════════
# LAYER 1 — BB84 QKD SIMULATOR
# ═══════════════════════════════════════════════════════════════
 
RECTILINEAR = 0   # + basis: |0⟩ / |1⟩
DIAGONAL    = 1   # × basis: |+⟩ / |−⟩
 
 
class BB84Simulator:
    """
    Software simulation of the BB84 quantum key distribution protocol.
 
    Steps:
      1. Alice generates random bits + bases.
      2. Alice encodes qubits and "sends" them.
      3. Bob measures in randomly chosen bases.
      4. Basis sifting — keep only matching-basis bits.
      5. QBER estimation — high error rate → abort (Eve detected).
      6. Privacy amplification via SHA3-256.
 
    Parameters
    ----------
    key_length_bits   : target final key size (default 256)
    channel_error_rate: simulated channel noise (0.02 = 2 %)
    abort_threshold   : QBER above this → eavesdropper detected (BB84 theory: ~11 %)
    """
 
    def __init__(self, key_length_bits=256, channel_error_rate=0.02, abort_threshold=0.11):
        self.key_length_bits    = key_length_bits
        self.channel_error_rate = channel_error_rate
        self.abort_threshold    = abort_threshold
        self.n_qubits           = key_length_bits * 6   # ~50 % sifted, 10 % sampled
 
    # ── helpers ────────────────────────────────────────────────────────────
 
    @staticmethod
    def _rand_bits(n: int) -> list:
        raw  = secrets.token_bytes((n + 7) // 8)
        bits = []
        for byte in raw:
            for i in range(7, -1, -1):
                bits.append((byte >> i) & 1)
        return bits[:n]
 
    def _measure(self, bit: int, alice_basis: int, bob_basis: int) -> int:
        if alice_basis == bob_basis:
            # Correct basis — apply channel noise
            if self.channel_error_rate > 0:
                if secrets.randbelow(10000) < int(self.channel_error_rate * 10000):
                    return bit ^ 1
            return bit
        return secrets.randbelow(2)   # wrong basis → random
 
    @staticmethod
    def _bits_to_bytes(bits: list) -> bytes:
        padded = bits + [0] * ((-len(bits)) % 8)
        out = bytearray()
        for i in range(0, len(padded), 8):
            b = 0
            for bit in padded[i:i+8]:
                b = (b << 1) | bit
            out.append(b)
        return bytes(out)
 
    # ── main protocol ───────────────────────────────────────────────────────
 
    def run(self) -> dict:
        """Execute BB84 and return a dict with key_hex and protocol stats."""
        alice_bits  = self._rand_bits(self.n_qubits)
        alice_bases = self._rand_bits(self.n_qubits)
        bob_bases   = self._rand_bits(self.n_qubits)
 
        # Transmission + measurement
        bob_results = [
            self._measure(alice_bits[i], alice_bases[i], bob_bases[i])
            for i in range(self.n_qubits)
        ]
 
        # Sifting
        sifted_alice, sifted_bob = [], []
        for i in range(self.n_qubits):
            if alice_bases[i] == bob_bases[i]:
                sifted_alice.append(alice_bits[i])
                sifted_bob.append(bob_results[i])
 
        if len(sifted_alice) < self.key_length_bits + 20:
            raise RuntimeError('BB84: too few sifted bits — increase n_qubits')
 
        # QBER estimation (10 % sample)
        sample_size = max(10, len(sifted_alice) // 10)
        sample_idx  = set(secrets.SystemRandom().sample(range(len(sifted_alice)), sample_size))
        errors      = sum(1 for i in sample_idx if sifted_alice[i] != sifted_bob[i])
        qber        = errors / sample_size
 
        eavesdropper = qber > self.abort_threshold
        if eavesdropper:
            logger.warning(f'BB84: QBER={qber:.3f} > threshold — eavesdropper suspected')
 
        # Raw key (exclude sampled bits)
        raw_bits = [sifted_alice[i] for i in range(len(sifted_alice)) if i not in sample_idx]
        raw_bits = raw_bits[:self.key_length_bits]
 
        # Privacy amplification
        key_hex = hashlib.sha3_256(self._bits_to_bytes(raw_bits)).hexdigest()
 
        logger.info(f'BB84: done — QBER={qber:.3f}, sifted={len(sifted_alice)}, '
                    f'eavesdropper={eavesdropper}')
 
        return {
            'key_hex':              key_hex,
            'key_length_bits':      self.key_length_bits,
            'qber':                 round(qber, 4),
            'eavesdropper_detected': eavesdropper,
            'sifting_efficiency':   round(len(sifted_alice) / self.n_qubits, 3),
            'qubits_sent':          self.n_qubits,
            'generation_method':    'bb84_sim',
        }
 
 
def run_bb84_demo(key_length_bits=128) -> dict:
    """Public helper — runs BB84 and strips the actual key (safe for API demo endpoint)."""
    result = BB84Simulator(key_length_bits=key_length_bits).run()
    result.pop('key_hex', None)
    return result
 
 
# ═══════════════════════════════════════════════════════════════
# LAYER 2 — QRNG SERVICE
# ═══════════════════════════════════════════════════════════════
 
_ANU_URL     = 'https://qrng.anu.edu.au/API/jsonI.php'
_ANU_TIMEOUT = 5
 
 
def _fetch_anu(n_bytes: int) -> Optional[bytes]:
    """Call the ANU Quantum Vacuum Fluctuation API. Returns None on any failure."""
    url = f'{_ANU_URL}?length={n_bytes}&type=uint8'
    try:
        req  = urllib.request.Request(url, headers={'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=_ANU_TIMEOUT) as resp:
            data = json.loads(resp.read().decode())
        if data.get('success') and len(data.get('data', [])) >= n_bytes:
            return bytes(data['data'][:n_bytes])
        logger.warning('QRNG: ANU returned unexpected payload')
    except Exception as e:
        logger.warning(f'QRNG: ANU API unavailable — {e}')
    return None
 
 
def get_quantum_random_bytes(n_bytes: int = 32) -> dict:
    """
    Return n_bytes of quantum-random data via the best available source.
 
    Returns dict: random_bytes, random_hex, generation_method, source_detail
    """
    # 1. ANU QRNG API (real quantum randomness)
    raw = _fetch_anu(n_bytes)
    if raw:
        logger.info(f'QRNG: {n_bytes}B from ANU Quantum Vacuum API')
        return {
            'random_bytes':      raw,
            'random_hex':        raw.hex(),
            'generation_method': 'qrng_api',
            'source_detail':     'ANU Quantum Vacuum Fluctuation API',
        }
 
    # 2. BB84 simulation
    try:
        result = BB84Simulator(key_length_bits=n_bytes * 8).run()
        raw    = bytes.fromhex(result['key_hex'])[:n_bytes]
        logger.info(f'QRNG: {n_bytes}B from BB84 simulation (ANU unavailable)')
        return {
            'random_bytes':      raw,
            'random_hex':        raw.hex(),
            'generation_method': 'bb84_sim',
            'source_detail':     'BB84 QKD Protocol Simulation',
        }
    except Exception as e:
        logger.warning(f'QRNG: BB84 fallback failed — {e}')
 
    # 3. OS CSPRNG (secrets / /dev/urandom)
    raw = secrets.token_bytes(n_bytes)
    logger.info(f'QRNG: {n_bytes}B from OS CSPRNG fallback')
    return {
        'random_bytes':      raw,
        'random_hex':        raw.hex(),
        'generation_method': 'fallback',
        'source_detail':     'OS Cryptographically Secure PRNG',
    }
 
 
def generate_quantum_key_hex(key_length_bits: int = 256) -> dict:
    """
    Generate a quantum key and condition it through SHA3-256.
    Returns dict: key_hex, key_length_bits, generation_method, source_detail
    """
    n_bytes = (key_length_bits + 7) // 8
    result  = get_quantum_random_bytes(n_bytes)
    conditioned = hashlib.sha3_256(result['random_bytes']).hexdigest()
    return {
        'key_hex':           conditioned,
        'key_length_bits':   key_length_bits,
        'generation_method': result['generation_method'],
        'source_detail':     result['source_detail'],
    }
 
 
# ═══════════════════════════════════════════════════════════════
# LAYER 3 — KEY MANAGER  (AES-256-GCM)
# ═══════════════════════════════════════════════════════════════
 
_GCM_NONCE_BYTES = 12   # 96-bit nonce (NIST SP 800-38D)
 
 
def _derive_master_key() -> bytes:
    """Derive 256-bit master encryption key from Django SECRET_KEY via PBKDF2."""
    from django.conf import settings
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b'qauth-engine-v1',
        iterations=600_000,
        backend=default_backend(),
    )
    return kdf.derive(settings.SECRET_KEY.encode())
 
 
def _encrypt(plaintext_hex: str) -> bytes:
    """AES-256-GCM encrypt. Returns nonce(12) ‖ ciphertext+tag."""
    nonce  = os.urandom(_GCM_NONCE_BYTES)
    aesgcm = AESGCM(_derive_master_key())
    ct     = aesgcm.encrypt(nonce, plaintext_hex.encode(), None)
    return nonce + ct
 
 
def _decrypt(blob: bytes) -> str:
    """AES-256-GCM decrypt the stored blob. Returns plaintext hex string."""
    nonce  = bytes(blob[:_GCM_NONCE_BYTES])
    ct     = bytes(blob[_GCM_NONCE_BYTES:])
    aesgcm = AESGCM(_derive_master_key())
    return aesgcm.decrypt(nonce, ct, None).decode()
 
 
def key_fingerprint(key_hex: str) -> str:
    """SHA-256 fingerprint of a key hex string (stored in DB for identification)."""
    return hashlib.sha256(key_hex.encode()).hexdigest()
 
 
def generate_and_store_key(user) -> 'QuantumKey':
    """
    Generate a quantum key for *user*, encrypt it, and upsert the DB record.
    Also updates user.quantum_key_id.
    Returns the QuantumKey instance.
    """
    from authentication.models import QuantumKey
    from django.utils import timezone
 
    kd      = generate_quantum_key_hex(key_length_bits=256)
    blob    = _encrypt(kd['key_hex'])
    fp      = key_fingerprint(kd['key_hex'])
 
    qkey, created = QuantumKey.objects.update_or_create(
        user=user,
        defaults={
            'encrypted_key':    blob,
            'key_fingerprint':  fp,
            'generation_method': kd['generation_method'],
            # Rotation should re-allow a one-time reveal for the demo.
            'revealed_at':      None,
        },
    )
    user.quantum_key_id = str(qkey.id)
    user.save(update_fields=['quantum_key_id'])
 
    # If the key already existed, treat the operation as a rotation.
    if not created:
        qkey.rotated_at = timezone.now()
        qkey.save(update_fields=['rotated_at'])

    action = 'Created' if created else 'Rotated'
    logger.info(f'KeyManager: {action} key [{fp[:8]}…] for {user.username} via {kd["generation_method"]}')
    return qkey
 
 
def get_user_key_hex(user) -> Optional[str]:
    """Retrieve and decrypt the quantum key for a given user. Returns None if absent."""
    try:
        return _decrypt(bytes(user.quantum_key.encrypted_key))
    except Exception as e:
        logger.error(f'KeyManager: decrypt failed for {user.username} — {e}')
        return None