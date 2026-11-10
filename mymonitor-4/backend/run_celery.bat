@echo off
title Fabric Monitor - Celery Worker
echo ===================================================
echo Starting Celery Worker (Thread pool for Windows)
echo Broker: Redis on localhost:6379
echo ===================================================

if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
) else (
    echo [WARNING] venv\Scripts\activate.bat not found. Using system python.
)

celery -A app.core.celery_app.celery_app worker -P threads --concurrency=4 --loglevel=info
pause
