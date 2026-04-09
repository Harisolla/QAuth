import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone
 
 
# ── User Manager ─────────────────────────────────────────────────────────────
 
class QAuthUserManager(BaseUserManager):
    def create_user(self, email, username, password=None, **extra):
        if not email:
            raise ValueError('Email is required')
        user = self.model(email=self.normalize_email(email), username=username, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user
 
    def create_superuser(self, email, username, password=None, **extra):
        extra.setdefault('is_staff',     True)
        extra.setdefault('is_superuser', True)
        extra.setdefault('is_admin',     True)
        return self.create_user(email, username, password, **extra)
 
 
# ── Custom User ───────────────────────────────────────────────────────────────
 
class QAuthUser(AbstractBaseUser, PermissionsMixin):
    id       = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email    = models.EmailField(unique=True)
    username = models.CharField(max_length=150, unique=True)
 
    # Account state
    is_active = models.BooleanField(default=True)
    is_staff  = models.BooleanField(default=False)
    is_admin  = models.BooleanField(default=False)
    is_locked = models.BooleanField(default=False)
 
    # Brute-force tracking
    failed_login_attempts = models.PositiveIntegerField(default=0)
    last_failed_login     = models.DateTimeField(null=True, blank=True)
 
    # Reference to the user's quantum key record
    quantum_key_id = models.CharField(max_length=64, blank=True, null=True)
 
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
 
    objects = QAuthUserManager()
 
    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = ['username']
 
    class Meta:
        db_table    = 'qauth_users'
        verbose_name = 'Q-Auth User'
 
    def __str__(self):
        return f'{self.username} <{self.email}>'
 
    def increment_failed_attempts(self):
        self.failed_login_attempts += 1
        self.last_failed_login = timezone.now()
        if self.failed_login_attempts >= 5:
            self.is_locked = True
        self.save(update_fields=['failed_login_attempts', 'last_failed_login', 'is_locked'])
 
    def reset_failed_attempts(self):
        self.failed_login_attempts = 0
        self.is_locked = False
        self.save(update_fields=['failed_login_attempts', 'is_locked'])
 
 
# ── Quantum Key ───────────────────────────────────────────────────────────────
 
class QuantumKey(models.Model):
    """Stores each user's quantum-generated key, AES-256-GCM encrypted at rest."""
    GENERATION_METHODS = [
        ('qrng_api', 'ANU QRNG API'),
        ('bb84_sim', 'BB84 Simulation'),
        ('fallback', 'Secure Fallback (OS CSPRNG)'),
    ]
 
    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user            = models.OneToOneField(QAuthUser, on_delete=models.CASCADE, related_name='quantum_key')
    encrypted_key   = models.BinaryField()                          # AES-GCM ciphertext
    key_fingerprint = models.CharField(max_length=64)               # SHA-256 of plaintext key
    generation_method = models.CharField(max_length=20, choices=GENERATION_METHODS, default='qrng_api')
    created_at      = models.DateTimeField(default=timezone.now)
    rotated_at      = models.DateTimeField(null=True, blank=True)
    # Demo-only: allow revealing the raw quantum key hex to the client once per key.
    revealed_at     = models.DateTimeField(null=True, blank=True)
 
    class Meta:
        db_table = 'quantum_keys'
 
    def __str__(self):
        return f'Key [{self.key_fingerprint[:8]}…] → {self.user.username}'
 
 
# ── Login Event (audit log) ───────────────────────────────────────────────────
 
class LoginEvent(models.Model):
    RISK_LEVELS = [
        ('low',      'Low'),
        ('medium',   'Medium'),
        ('high',     'High'),
        ('critical', 'Critical'),
    ]
 
    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user             = models.ForeignKey(QAuthUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='login_events')
    email_attempted  = models.EmailField()
    ip_address       = models.GenericIPAddressField()
    user_agent       = models.TextField(blank=True)
    success          = models.BooleanField()
    failure_reason   = models.CharField(max_length=100, blank=True)
 
    # Anomaly engine output
    anomaly_score  = models.FloatField(default=0.0)
    risk_level     = models.CharField(max_length=10, choices=RISK_LEVELS, default='low')
    anomaly_flags  = models.JSONField(default=list)
 
    timestamp = models.DateTimeField(default=timezone.now)
 
    class Meta:
        db_table = 'login_events'
        ordering = ['-timestamp']
        indexes  = [
            models.Index(fields=['ip_address', 'timestamp']),
            models.Index(fields=['user',       'timestamp']),
            models.Index(fields=['risk_level']),
        ]
 
    def __str__(self):
        status = 'OK' if self.success else 'FAIL'
        return f'[{status}] {self.email_attempted} @ {self.ip_address}'
 
 
# ── Threat Alert ──────────────────────────────────────────────────────────────
 
class ThreatAlert(models.Model):
    ALERT_TYPES = [
        ('brute_force',         'Brute Force'),
        ('credential_stuffing', 'Credential Stuffing'),
        ('bot_pattern',         'Bot Pattern'),
        ('account_takeover',    'Account Takeover Attempt'),
        ('time_anomaly',        'Unusual Login Time'),
    ]
    STATUS_CHOICES = [
        ('open',           'Open'),
        ('investigating',  'Investigating'),
        ('resolved',       'Resolved'),
        ('false_positive', 'False Positive'),
    ]
 
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    login_event = models.ForeignKey(LoginEvent, on_delete=models.CASCADE, related_name='alerts')
    alert_type  = models.CharField(max_length=30, choices=ALERT_TYPES)
    description = models.TextField()
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    resolved_by = models.ForeignKey(QAuthUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='resolved_alerts')
    created_at  = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)
 
    class Meta:
        db_table = 'threat_alerts'
        ordering = ['-created_at']
 
    def __str__(self):
        return f'[{self.alert_type}] {self.status}'