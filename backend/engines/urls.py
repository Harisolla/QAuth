from django.http import JsonResponse
from django.urls import path


def quantum_key_demo(request):
    """
    Simple demo endpoint to show the quantum-key pipeline metadata.
    Does not return the raw key material.
    """
    if request.method != "GET":
        return JsonResponse({"detail": "Method not allowed"}, status=405)

    # Import lazily so Django startup/migrations don't fail if deps vary.
    from .quantum_key import generate_quantum_key_hex

    result = generate_quantum_key_hex(key_length_bits=256)
    # Return only metadata/fingerprint-safe fields.
    return JsonResponse(
        {
            "generation_method": result["generation_method"],
            "source_detail": result["source_detail"],
            "key_length_bits": result["key_length_bits"],
            "key_hex_sha3_256": result["key_hex"][:16] + "...",
        }
    )


def anomaly_score_demo(request):
    """Demo endpoint for the login anomaly scoring engine."""
    if request.method != "GET":
        return JsonResponse({"detail": "Method not allowed"}, status=405)

    from .anomaly_ml import score_login_attempt

    email = request.GET.get("email", "user@example.com")
    ip = request.GET.get("ip", "127.0.0.1")
    user_agent = request.GET.get("ua", "")

    scored = score_login_attempt(email=email, ip=ip, user_agent=user_agent)
    return JsonResponse(scored)


urlpatterns = [
    path("quantum-key-demo/", quantum_key_demo, name="quantum-key-demo"),
    path("anomaly-score-demo/", anomaly_score_demo, name="anomaly-score-demo"),
]

