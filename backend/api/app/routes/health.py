from fastapi import APIRouter, Request, Response

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(request: Request) -> dict[str, str]:
    # In-memory store is always ready for MVP.
    _ = request.app.state.store
    return {"status": "ready"}


@router.get("/metrics")
async def metrics(request: Request) -> Response:
    metrics_obj = request.app.state.metrics
    store = request.app.state.store
    registry = request.app.state.registry
    active = len(await store.list_active())
    body = metrics_obj.render_prometheus(active, registry.ws_count)
    return Response(content=body, media_type="text/plain; version=0.0.4; charset=utf-8")
