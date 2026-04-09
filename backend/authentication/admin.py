from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from authentication.models import QAuthUser, QuantumKey, LoginEvent, ThreatAlert


@admin.register(QAuthUser)
class QAuthUserAdmin(UserAdmin):
    list_display  = ('email', 'username', 'is_active', 'is_locked', 'failed_login_attempts', 'created_at')
    list_filter   = ('is_active', 'is_locked', 'is_admin')
    search_fields = ('email', 'username')
    ordering      = ('-created_at',)
    fieldsets     = (
        (None,       {'fields': ('email', 'username', 'password')}),
        ('Security', {'fields': ('is_active', 'is_locked', 'is_admin', 'failed_login_attempts', 'quantum_key_id')}),
        ('Permissions', {'fields': ('is_staff', 'is_superuser', 'groups', 'user_permissions')}),
    )
    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('email', 'username', 'password1', 'password2')}),
    )


@admin.register(QuantumKey)
class QuantumKeyAdmin(admin.ModelAdmin):
    list_display  = ('user', 'generation_method', 'key_fingerprint', 'created_at')
    list_filter   = ('generation_method',)
    readonly_fields = ('encrypted_key', 'key_fingerprint', 'created_at')


@admin.register(LoginEvent)
class LoginEventAdmin(admin.ModelAdmin):
    list_display  = ('email_attempted', 'ip_address', 'success', 'risk_level', 'anomaly_score', 'timestamp')
    list_filter   = ('success', 'risk_level')
    search_fields = ('email_attempted', 'ip_address')
    readonly_fields = ('anomaly_flags',)


@admin.register(ThreatAlert)
class ThreatAlertAdmin(admin.ModelAdmin):
    list_display  = ('alert_type', 'status', 'created_at')
    list_filter   = ('alert_type', 'status')