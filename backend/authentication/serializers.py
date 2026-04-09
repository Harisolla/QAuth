from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from authentication.models import QAuthUser


class RegisterSerializer(serializers.ModelSerializer):
    password  = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model  = QAuthUser
        fields = ('email', 'username', 'password', 'password2')

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        return QAuthUser.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model       = QAuthUser
        fields      = ('id', 'email', 'username', 'is_admin', 'created_at', 'quantum_key_id')
        read_only_fields = fields