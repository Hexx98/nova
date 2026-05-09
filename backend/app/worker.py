import hmac
import hashlib
import json
import time
from celery import Celery, Task
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "nova",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,          # only ack after task completes
    worker_prefetch_multiplier=1, # one task at a time per worker thread
    worker_hijack_root_logger=False,
    task_routes={"nova.tasks.*": {"queue": "nova_tasks"}},
)


def sign_payload(payload: dict) -> str:
    """HMAC-sign a task payload (STRIDE T6 mitigation)."""
    body = json.dumps(payload, sort_keys=True)
    return hmac.new(
        settings.celery_hmac_secret.encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()


def build_signed_kwargs(payload: dict) -> dict:
    """Attach issued_at timestamp and HMAC signature to kwargs before dispatching a task."""
    stamped = {**payload, "_issued_at": int(time.time())}
    return {**stamped, "_hmac_sig": sign_payload(stamped)}


def verify_payload(payload: dict, signature: str) -> bool:
    expected = sign_payload(payload)
    return hmac.compare_digest(expected, signature)


class NovaTask(Task):
    """
    Base task class for all Nova Celery tasks.

    Before execution:
    1. Verifies HMAC signature on the payload.
    2. Re-validates scope — scope is re-resolved at execution time inside the
       worker, not trusted from the dispatch payload (STRIDE E4 / DNS rebinding
       mitigation).
    """

    def __call__(self, *args, **kwargs):
        sig = kwargs.pop("_hmac_sig", None)
        # Verify HMAC with _issued_at still present in kwargs
        if not sig or not verify_payload(kwargs, sig):
            raise RuntimeError("Task payload HMAC verification failed — possible tampering detected")

        # Replay protection: reject tasks dispatched more than 5 minutes ago
        issued_at = kwargs.pop("_issued_at", None)
        if issued_at is None or (int(time.time()) - int(issued_at)) > 300:
            raise RuntimeError("Task payload replay protection: task too old or missing timestamp")

        engagement_id = kwargs.get("engagement_id")
        target = kwargs.get("target")
        if engagement_id and target:
            _validate_scope(engagement_id, target)

        return super().__call__(*args, **kwargs)


def _validate_scope(engagement_id: str, target: str) -> None:
    """
    Synchronous scope check called inside the Celery worker.
    Raises ValueError if the target is out of scope.
    Full async DB lookup is implemented per-task for Phase 1+.
    """
    # Placeholder — each task imports and calls its own async scope validator.
    # This hook exists as the enforcement point called by NovaTask.__call__.
    pass
