"""
engines/anomaly_ml.py
=====================
Login anomaly scoring engine for Q-Auth.
 
Scores each login attempt across 6 rule-based signals using Redis-backed
sliding-window counters. Returns a composite risk score (0.0–1.0) and
a risk level used by the auth view to allow, warn, or block the request.
 
Rules
-----
  1. brute_force         — repeated failures against one account from one IP
  2. ip_rate_limit       — too many total attempts from one IP (any account)
  3. credential_stuffing — many distinct emails tried from one IP
  4. bot_pattern         — missing or known-automation User-Agent string
  5. account_locked      — target account already locked by previous failures
  6. time_anomaly        — login during unusual hours (02:00–05:00 UTC)
 
Risk levels
-----------
  0.00 – 0.25 → low      (allow, log quietly)
  0.25 – 0.55 → medium   (allow, flag in audit log)
  0.55 – 0.80 → high     (allow, create ThreatAlert)
  0.80+       → critical  (block before authentication)
"""
 
import logging
from django.utils import timezone
from django.core.cache import cache
 
logger = logging.getLogger(__name__)
 
WINDOW_SECONDS = 300   # 5-minute sliding window for all counters
 
# Per-rule weights — tuned so a single strong signal hits high/critical,
# while weak signals only accumulate to medium unless combined.
WEIGHTS = {
    'brute_force':         0.45,
    'ip_rate_limit':       0.30,
    'credential_stuffing': 0.40,
    'bot_pattern':         0.25,
    'account_locked':      0.50,
    'time_anomaly':        0.15,
}
 
# Substrings in User-Agent that indicate automation / scripting tools
BOT_UA_MARKERS = [
    'python-requests', 'python-urllib', 'curl/', 'wget/', 'go-http-client',
    'java/', 'libwww-perl', 'scrapy', 'httpie', 'okhttp',
]
 
 
# ── cache helpers ─────────────────────────────────────────────────────────────
 
def _incr(key: str, ttl: int = WINDOW_SECONDS) -> int:
    """Atomically increment a Redis counter; create at 1 if absent."""
    try:
        val = cache.get(key, 0) + 1
        cache.set(key, val, ttl)
        return val
    except Exception:
        return 0
 
 
def _set_add(key: str, value: str, ttl: int = WINDOW_SECONDS) -> int:
    """Add *value* to a cached set and return the new cardinality."""
    try:
        s = cache.get(key) or set()
        s.add(value)
        cache.set(key, s, ttl)
        return len(s)
    except Exception:
        return 0
 
 
# ── individual rules ──────────────────────────────────────────────────────────
 
def _rule_brute_force(email: str, ip: str) -> tuple:
    fails = cache.get(f'bf:{ip}:{email}', 0)
    if fails >= 10:
        return WEIGHTS['brute_force'], [f'brute_force:{fails}_fails']
    if fails >= 5:
        return WEIGHTS['brute_force'] * 0.55, [f'brute_force_warn:{fails}_fails']
    return 0.0, []
 
 
def _rule_ip_rate(ip: str) -> tuple:
    count = _incr(f'rate:{ip}')
    if count >= 50:
        return WEIGHTS['ip_rate_limit'], [f'ip_rate:{count}_reqs']
    if count >= 20:
        return WEIGHTS['ip_rate_limit'] * 0.5, [f'ip_rate_warn:{count}_reqs']
    return 0.0, []
 
 
def _rule_credential_stuffing(ip: str, email: str) -> tuple:
    distinct = _set_add(f'cstuff:{ip}', email)
    if distinct >= 15:
        return WEIGHTS['credential_stuffing'], [f'cred_stuffing:{distinct}_emails']
    if distinct >= 7:
        return WEIGHTS['credential_stuffing'] * 0.5, [f'cred_stuffing_warn:{distinct}_emails']
    return 0.0, []
 
 
def _rule_bot_pattern(user_agent: str) -> tuple:
    ua = user_agent.lower().strip()
    if not ua:
        return WEIGHTS['bot_pattern'], ['bot_ua:empty']
    for marker in BOT_UA_MARKERS:
        if marker in ua:
            return WEIGHTS['bot_pattern'], [f'bot_ua:{marker}']
    return 0.0, []
 
 
def _rule_account_locked(email: str) -> tuple:
    try:
        from authentication.models import QAuthUser
        if QAuthUser.objects.filter(email=email, is_locked=True).exists():
            return WEIGHTS['account_locked'], ['account_locked']
    except Exception:
        pass
    return 0.0, []
 
 
def _rule_time_anomaly(_email: str) -> tuple:
    """Flag logins between 02:00–05:00 UTC as mildly suspicious."""
    if 2 <= timezone.now().hour <= 5:
        return WEIGHTS['time_anomaly'], ['unusual_hour_utc']
    return 0.0, []
 
 
# ── public helpers ────────────────────────────────────────────────────────────
 
def record_failed_attempt(email: str, ip: str):
    """Call this after a confirmed failed login to feed the brute-force rule."""
    _incr(f'bf:{ip}:{email}')
 
 
def _score_to_risk(score: float) -> str:
    if score >= 0.80: return 'critical'
    if score >= 0.55: return 'high'
    if score >= 0.25: return 'medium'
    return 'low'
 
 
def score_login_attempt(email: str, ip: str, user_agent: str = '', **_) -> dict:
    """
    Score a login attempt and return risk metadata.
 
    Parameters
    ----------
    email      : str   email address being attempted
    ip         : str   client IP address
    user_agent : str   HTTP User-Agent header value
 
    Returns
    -------
    dict
        score      float   0.0 – 1.0
        risk_level str     'low' | 'medium' | 'high' | 'critical'
        flags      list    names of triggered rules with counts
    """
    rules = [
        _rule_brute_force(email, ip),
        _rule_ip_rate(ip),
        _rule_credential_stuffing(ip, email),
        _rule_bot_pattern(user_agent),
        _rule_account_locked(email),
        _rule_time_anomaly(email),
    ]
 
    composite = 0.0
    all_flags = []
    for rule_score, flags in rules:
        composite += rule_score
        all_flags.extend(flags)
 
    composite  = min(round(composite, 4), 1.0)
    risk_level = _score_to_risk(composite)
 
    if composite > 0:
        logger.info(f'Anomaly [{risk_level}] {email}@{ip} score={composite} flags={all_flags}')
 
    return {'score': composite, 'risk_level': risk_level, 'flags': all_flags}