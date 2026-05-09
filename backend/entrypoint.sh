#!/bin/bash
set -e

# Run Alembic migrations before starting the application.
# Skipped when the Celery worker overrides CMD — worker doesn't need to migrate.
if [[ "$1" == uvicorn* ]]; then
    echo "[entrypoint] Running database migrations..."
    alembic upgrade head
    echo "[entrypoint] Migrations complete."
fi

exec "$@"
