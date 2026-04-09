from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from authentication import views

urlpatterns = [
    path('register/',    views.register,   name='auth-register'),
    path('rotate-key/',  views.rotate_key, name='auth-rotate-key'),
    path('token/',       views.QuantumTokenObtainPairView.as_view(), name='token-obtain-pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('quantum-key-reveal/', views.quantum_key_reveal, name='quantum-key-reveal'),
    path('quantum-challenge/',  views.quantum_challenge,  name='quantum-challenge'),
    path('quantum-login/',       views.quantum_login,       name='quantum-login'),
    path('key-info/',   views.key_info,   name='quantum-key-info'),
    path('bb84-demo/',  views.bb84_demo,  name='bb84-demo'),
    path('stats/',      views.admin_stats, name='admin-stats'),
    path('events/',     views.login_events, name='login-events'),
    path('alerts/',     views.threat_alerts, name='threat-alerts'),
    path('users/',      views.users_list,  name='users-list'),
    path('alerts/<uuid:alert_id>/resolve/', views.resolve_alert, name='resolve-alert'),
]