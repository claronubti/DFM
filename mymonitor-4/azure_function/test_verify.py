import asyncio
import sys
import os

# Ensure azure_function root is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), ".")))

from db.session import normalize_db_url, init_db
from services.fabric_service import fabric_service
from services.db_service import db_service
from services.watchdog_engine import watchdog_engine
from function_app import fastapi_app


async def test():
    print("==================================================================")
    print("1. Testing Database URL Normalization & Connection Initialization")
    print("==================================================================")
    test_url = "mssql+aioodbc://usr:pwd@srv.database.windows.net/db?driver=ODBC+Driver+18+for+SQL+Server"
    normalized = normalize_db_url(test_url)
    assert "TrustServerCertificate=yes" in normalized, "Normalization should append TrustServerCertificate"
    print(f"[SUCCESS]: normalize_db_url verified: {normalized}")

    await init_db()
    print("[SUCCESS]: Database session initialization executed successfully.")

    print("\n==================================================================")
    print("2. Testing Microsoft Fabric OAuth2 Service Principal Authentication")
    print("==================================================================")
    token = await fabric_service.get_token()
    if token:
        print(f"[SUCCESS]: Fabric OAuth2 Token acquired successfully! (Length: {len(token)})")
    else:
        print("❌ FAILED: Could not acquire Fabric access token.")
        return

    print("\n==================================================================")
    print("3. Testing Capacity-Assigned Workspace Discovery (~30 Workspaces)")
    print("==================================================================")
    workspaces = await fabric_service.get_capacity_workspaces()
    print(f"[SUCCESS]: Discovered {len(workspaces)} capacity-assigned workspaces:")
    for i, ws in enumerate(workspaces[:10], 1):
        name = ws.get("displayName") or ws.get("name")
        wid = ws.get("id")
        cid = ws.get("capacityId")
        print(f"   [{i}] {name}")
        print(f"       Workspace ID: {wid}")
        print(f"       Capacity ID:  {cid}")

    if len(workspaces) > 10:
        print(f"   ... and {len(workspaces) - 10} more capacity workspaces.")

    print("\n==================================================================")
    print("4. Testing Configured SLA Pipelines Query from Azure SQL")
    print("==================================================================")
    configured_slas = await db_service.get_configured_sla_pipelines()
    print(f"[SUCCESS]: Found {len(configured_slas)} pipeline(s) configured with L1/L2 support.")
    for cfg in configured_slas[:5]:
        print(f"   - {cfg.get('pipelineName')} (Workspace: {cfg.get('workspaceId')})")
        print(f"     L1: {cfg.get('l1Email')}, L2: {cfg.get('l2Email')}, SLA1: {cfg.get('sla1Minutes')}m, SLA2: {cfg.get('sla2Minutes')}m")

    print("\n==================================================================")
    print("5. Testing Autonomous Watchdog Sweep Execution")
    print("==================================================================")
    sweep_stats = await watchdog_engine.run_watchdog_sweep()
    print(f"[SUCCESS]: Watchdog sweep completed successfully:")
    for k, v in sweep_stats.items():
        print(f"   {k}: {v}")

    print("\n==================================================================")
    print("6. Testing FastAPI OpenAPI / Swagger Schema Generation")
    print("==================================================================")
    openapi_schema = fastapi_app.openapi()
    paths = list(openapi_schema.get("paths", {}).keys())
    print(f"[SUCCESS]: Generated OpenAPI schema with {len(paths)} routes:")
    for p in paths:
        print(f"   - {p}")

    print("\n==================================================================")
    print("ALL TESTS PASSED SUCCESSFULLY!")
    print("==================================================================")


if __name__ == "__main__":
    asyncio.run(test())
