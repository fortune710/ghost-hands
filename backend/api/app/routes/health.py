from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> dict[str, str]:
    return {"status": "ready"}


@router.get("/metrics")
async def metrics() -> str:
    # Prometheus text exposition scaffold — real counters in M2.
    return "# HELP ghosthands_up 1 if process is up\n# TYPE ghosthands_up gauge\nghosthands_up 1\n"
