from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Count
from django.utils import timezone
from datetime import timedelta

from engines.quantum_key import run_bb84_demo, generate_and_store_key, get_user_key_hex
from engines.anomaly_ml import score_login_attempt, record_failed_attempt
from authentication.models import QAuthUser, LoginEvent, ThreatAlert
from authentication.serializers import RegisterSerializer, UserSerializer

from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework.exceptions import AuthenticationFailed


def _is_admin(request):
    return request.user.is_authenticated and request.user.is_admin


# ── Quantum endpoints ─────────────────────────────────────────────────────────


class QuantumTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    After successful login, generate/store the quantum key for the authenticated user.
    Returns quantum-key metadata alongside the normal JWT response.
    """

    def validate(self, attrs):
        request = self.context.get("request")
        email_attempted = attrs.get("email") or ""

        def _get_client_ip() -> str:
            if not request:
                return "127.0.0.1"
            xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
            if xff:
                return xff.split(",")[0].strip() or "127.0.0.1"
            return request.META.get("REMOTE_ADDR", "") or "127.0.0.1"

        def _get_user_agent() -> str:
            if not request:
                return ""
            return request.META.get("HTTP_USER_AGENT", "") or ""

        ip = _get_client_ip()
        user_agent = _get_user_agent()

        try:
            data = super().validate(attrs)

            # `self.user` is set by the base serializer after credential authentication.
            user = getattr(self, "user", None)
            if user is not None and getattr(user, "is_active", True):
                try:
                    scored = score_login_attempt(
                        email=email_attempted or getattr(user, "email", ""),
                        ip=ip,
                        user_agent=user_agent,
                    )

                    LoginEvent.objects.create(
                        user=user,
                        email_attempted=email_attempted or getattr(user, "email", ""),
                        ip_address=ip,
                        user_agent=user_agent,
                        success=True,
                        failure_reason="",
                        anomaly_score=scored.get("score", 0.0),
                        risk_level=scored.get("risk_level", "low"),
                        anomaly_flags=scored.get("flags", []),
                    )
                except Exception:
                    # Never block login for audit logging failures.
                    pass

                try:
                    qk = generate_and_store_key(user)
                    data.update(
                        quantum_key_fingerprint=qk.key_fingerprint,
                        quantum_key_generation_method=qk.generation_method,
                        quantum_key_created_at=qk.created_at.isoformat(),
                        quantum_key_rotated_at=qk.rotated_at.isoformat() if qk.rotated_at else None,
                    )
                except Exception:
                    # Never block login if quantum-key generation fails.
                    pass

            return data
        except AuthenticationFailed as e:
            # Failed login attempt: record it so the admin dashboard can show unsafe attempts.
            try:
                if email_attempted:
                    record_failed_attempt(email_attempted, ip)

                    existing_user = QAuthUser.objects.filter(email=email_attempted).first()
                    if existing_user:
                        # Track brute-force counts and lock-out state for the anomaly engine.
                        existing_user.increment_failed_attempts()

                    scored = score_login_attempt(
                        email=email_attempted,
                        ip=ip,
                        user_agent=user_agent,
                    )

                    LoginEvent.objects.create(
                        user=existing_user,
                        email_attempted=email_attempted,
                        ip_address=ip,
                        user_agent=user_agent,
                        success=False,
                        failure_reason=str(e)[:100],
                        anomaly_score=scored.get("score", 0.0),
                        risk_level=scored.get("risk_level", "low"),
                        anomaly_flags=scored.get("flags", []),
                    )
            except Exception:
                # Never block the actual auth failure response.
                pass

            raise


class QuantumTokenObtainPairView(TokenObtainPairView):
    serializer_class = QuantumTokenObtainPairSerializer


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """POST /api/auth/register/ — creates user and generates an initial quantum key."""
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    qk = generate_and_store_key(user)
    return Response(
        {
            'message': 'User registered; quantum key generated.',
            'user': UserSerializer(user).data,
            'quantum_key': {
                'key_fingerprint': qk.key_fingerprint,
                'generation_method': qk.generation_method,
                'created_at': qk.created_at.isoformat(),
                'rotated_at': qk.rotated_at.isoformat() if qk.rotated_at else None,
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def rotate_key(request):
    """POST /api/auth/rotate-key/ — rotates the user's quantum key (metadata only)."""
    qk = generate_and_store_key(request.user)
    return Response(
        {
            'message': 'Quantum key rotated.',
            'quantum_key': {
                'key_fingerprint': qk.key_fingerprint,
                'generation_method': qk.generation_method,
                'created_at': qk.created_at.isoformat(),
                'rotated_at': qk.rotated_at.isoformat() if qk.rotated_at else None,
            },
        }
    )


# ── Quantum-key authentication (demo) ──────────────────────────────────────


def _get_client_ip(request) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        return xff.split(",")[0].strip() or "127.0.0.1"
    return request.META.get("REMOTE_ADDR", "") or "127.0.0.1"


def _get_user_agent(request) -> str:
    return request.META.get("HTTP_USER_AGENT", "") or ""


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def quantum_key_reveal(request):
    """
    Demo-only endpoint: returns the raw quantum key hex ONCE per generated key.
    After `revealed_at` is set, further calls will return 403.
    """
    try:
        qk = request.user.quantum_key
    except Exception:
        return Response({"error": "No quantum key found."}, status=status.HTTP_404_NOT_FOUND)

    if qk.revealed_at is not None:
        return Response(
            {
                "error": "Quantum key already revealed for this key (demo: one-time reveal).",
                "rotate_endpoint": "/api/auth/rotate-key/",
                "hint": "Call rotate-key to generate a new key and allow a new one-time reveal.",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    key_hex = get_user_key_hex(request.user)
    if not key_hex:
        return Response({"error": "Failed to decrypt quantum key."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    qk.revealed_at = timezone.now()
    qk.save(update_fields=["revealed_at"])

    return Response(
        {
            "key_hex": key_hex,
            "key_fingerprint": qk.key_fingerprint,
            "generation_method": qk.generation_method,
            "created_at": qk.created_at.isoformat(),
            "revealed_at": qk.revealed_at.isoformat(),
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def quantum_challenge(request):
    """
    Demo challenge endpoint.
    Returns a nonce that the client signs using the raw quantum key (HMAC-SHA256).
    """
    email = request.data.get("email", "")
    if not email:
        return Response({"detail": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)

    # For demo we don't persist the nonce server-side; proof verification is enough.
    import secrets
    nonce = secrets.token_hex(16)
    return Response({"nonce": nonce})


@api_view(["POST"])
@permission_classes([AllowAny])
def quantum_login(request):
    """
    Quantum-key authentication (demo):
      Client sends: { email, nonce, proof }
      Where proof = HMAC-SHA256(nonce, quantum_key_bytes)
    If proof is valid, issue JWT (access/refresh).
    """
    from rest_framework_simplejwt.tokens import RefreshToken
    import hmac
    import hashlib

    email = request.data.get("email", "")
    nonce = request.data.get("nonce", "")
    proof = request.data.get("proof", "")

    if not (email and nonce and proof):
        return Response(
            {"detail": "email, nonce, and proof are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ip = _get_client_ip(request)
    user_agent = _get_user_agent(request)

    user = QAuthUser.objects.filter(email=email).first()
    if user is None:
        return Response({"detail": "Invalid quantum key proof."}, status=status.HTTP_401_UNAUTHORIZED)

    key_hex = get_user_key_hex(user)
    if not key_hex:
        return Response({"detail": "Quantum key not available."}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        key_bytes = bytes.fromhex(key_hex)
    except Exception:
        # Fallback: treat key_hex as ASCII if it isn't valid hex.
        key_bytes = key_hex.encode()

    expected = hmac.new(key_bytes, nonce.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, str(proof)):
        # Record a failed attempt for the admin dashboard.
        try:
            record_failed_attempt(email=email, ip=ip)
            user.increment_failed_attempts()
            scored = score_login_attempt(email=email, ip=ip, user_agent=user_agent)
            LoginEvent.objects.create(
                user=user,
                email_attempted=email,
                ip_address=ip,
                user_agent=user_agent,
                success=False,
                failure_reason="Invalid quantum proof",
                anomaly_score=scored.get("score", 0.0),
                risk_level=scored.get("risk_level", "low"),
                anomaly_flags=scored.get("flags", []),
            )
        except Exception:
            pass

        return Response({"detail": "Invalid quantum key proof."}, status=status.HTTP_401_UNAUTHORIZED)

    # Success: record login event + issue JWT.
    scored = score_login_attempt(email=email, ip=ip, user_agent=user_agent)
    try:
        LoginEvent.objects.create(
            user=user,
            email_attempted=email,
            ip_address=ip,
            user_agent=user_agent,
            success=True,
            failure_reason="",
            anomaly_score=scored.get("score", 0.0),
            risk_level=scored.get("risk_level", "low"),
            anomaly_flags=scored.get("flags", []),
        )
    except Exception:
        pass

    refresh = RefreshToken.for_user(user)
    access_token = str(refresh.access_token)
    refresh_token = str(refresh)

    return Response(
        {
            "access": access_token,
            "refresh": refresh_token,
            "quantum_key_fingerprint": user.quantum_key.key_fingerprint,
            "generation_method": user.quantum_key.generation_method,
        }
    )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def key_info(request):
    """GET /api/auth/key-info/ — current user's key metadata (never the raw key)."""
    try:
        qk = request.user.quantum_key
    except Exception:
        # Generate on-demand so quantum key creation is observable in demos.
        qk = generate_and_store_key(request.user)

    return Response({
        'key_fingerprint':  qk.key_fingerprint,
        'generation_method': qk.generation_method,
        'created_at':       qk.created_at.isoformat(),
        'rotated_at':       qk.rotated_at.isoformat() if qk.rotated_at else None,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def bb84_demo(request):
    """GET /api/auth/bb84-demo/ — runs BB84 sim and returns protocol stats (no key)."""
    stats = run_bb84_demo(key_length_bits=128)
    return Response({
        'message':  'BB84 QKD protocol simulation complete.',
        'protocol': 'BB84 — Bennett & Brassard (1984)',
        'stats':    stats,
    })


# ── Admin dashboard endpoints ─────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_stats(request):
    """GET /api/auth/stats/ — summary metrics."""
    if not _is_admin(request):
        return Response({'error': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    now     = timezone.now()
    last24h = now - timedelta(hours=24)
    ev24    = LoginEvent.objects.filter(timestamp__gte=last24h)

    return Response({
        'total_users':           QAuthUser.objects.count(),
        'locked_users':          QAuthUser.objects.filter(is_locked=True).count(),
        'login_attempts_24h':    ev24.count(),
        'successful_logins_24h': ev24.filter(success=True).count(),
        'failed_logins_24h':     ev24.filter(success=False).count(),
        'high_risk_events_24h':  ev24.filter(risk_level__in=['high', 'critical']).count(),
        'open_alerts':           ThreatAlert.objects.filter(status='open').count(),
        'risk_breakdown_24h':    list(ev24.values('risk_level').annotate(count=Count('id'))),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def login_events(request):
    """GET /api/auth/events/?risk_level=high&success=false&limit=50"""
    if not _is_admin(request):
        return Response({'error': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    qs = LoginEvent.objects.select_related('user').order_by('-timestamp')
    if risk := request.query_params.get('risk_level'):
        qs = qs.filter(risk_level=risk)
    if (s := request.query_params.get('success')) is not None:
        qs = qs.filter(success=(s.lower() == 'true'))
    limit = min(int(request.query_params.get('limit', 50)), 200)

    data = [{
        'id':            str(e.id),
        'email':         e.email_attempted,
        'username':      e.user.username if e.user else None,
        'ip_address':    e.ip_address,
        'success':       e.success,
        'failure_reason': e.failure_reason,
        'anomaly_score': e.anomaly_score,
        'risk_level':    e.risk_level,
        'anomaly_flags': e.anomaly_flags,
        'timestamp':     e.timestamp.isoformat(),
    } for e in qs[:limit]]

    return Response({'events': data, 'count': len(data)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def threat_alerts(request):
    """GET /api/auth/alerts/ — open threat alerts."""
    if not _is_admin(request):
        return Response({'error': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    alerts = ThreatAlert.objects.select_related('login_event').filter(
        status__in=['open', 'investigating']
    ).order_by('-created_at')[:100]

    data = [{
        'id':          str(a.id),
        'alert_type':  a.alert_type,
        'description': a.description,
        'status':      a.status,
        'ip_address':  a.login_event.ip_address,
        'email':       a.login_event.email_attempted,
        'created_at':  a.created_at.isoformat(),
    } for a in alerts]

    return Response({'alerts': data})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def resolve_alert(request, alert_id):
    """PATCH /api/auth/alerts/<id>/resolve/"""
    if not _is_admin(request):
        return Response({'error': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
    try:
        alert = ThreatAlert.objects.get(id=alert_id)
    except ThreatAlert.DoesNotExist:
        return Response({'error': 'Alert not found.'}, status=status.HTTP_404_NOT_FOUND)

    new_status = request.data.get('status', 'resolved')
    if new_status not in ('resolved', 'false_positive', 'investigating'):
        return Response({'error': 'Invalid status.'}, status=status.HTTP_400_BAD_REQUEST)

    alert.status      = new_status
    alert.resolved_by = request.user
    alert.resolved_at = timezone.now()
    alert.save()
    return Response({'message': f'Alert marked as {new_status}.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def users_list(request):
    """GET /api/auth/users/ — all users (admin only)."""
    if not _is_admin(request):
        return Response({'error': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    users = QAuthUser.objects.order_by('-created_at')[:200]
    data = [{
        'id':                     str(u.id),
        'email':                  u.email,
        'username':               u.username,
        'is_active':              u.is_active,
        'is_locked':              u.is_locked,
        'failed_login_attempts':  u.failed_login_attempts,
        'quantum_key_id':         u.quantum_key_id,
        'created_at':             u.created_at.isoformat(),
    } for u in users]
    return Response({'users': data})