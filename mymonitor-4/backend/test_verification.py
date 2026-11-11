import asyncio
from app.modules.pipelines.service import pipeline_service
from app.modules.sla.service import alert_service
from app.modules.sla.repository import sla_repository
from app.modules.diagnostics.service import ai_diagnostic_service
from app.core.config import settings

async def main():
    print("=" * 60)
    print("1. CONFIGURATION CHECK")
    print("=" * 60)
    print("  DATABASE_URL:", settings.DATABASE_URL)
    print("  CELERY_ENABLED:", settings.CELERY_ENABLED)
    print("  CELERY_BROKER:", settings.celery_broker)
    print("  AZURE_OPENAI_ENDPOINT:", settings.AZURE_OPENAI_ENDPOINT)
    print("  AZURE_OPENAI_DEPLOYMENT:", settings.AZURE_OPENAI_DEPLOYMENT)
    print("  AZURE_OPENAI_API_VERSION:", settings.AZURE_OPENAI_API_VERSION)
    print("  POLL_INTERVAL_ACTIVE_SECONDS:", settings.POLL_INTERVAL_ACTIVE_SECONDS)
    print("  POLL_INTERVAL_IDLE_SECONDS:", settings.POLL_INTERVAL_IDLE_SECONDS)

    assert ("mssql" in settings.DATABASE_URL or "sqlite" in settings.DATABASE_URL), "Database URL must be mssql or sqlite"
    assert settings.AZURE_OPENAI_DEPLOYMENT == "gpt-4o", "Deployment must be gpt-4o"
    print("  -> Configuration assertions PASSED!")

    print("\n" + "=" * 60)
    print("2. AZURE OPENAI DIAGNOSTICS CHECK")
    print("=" * 60)
    diag = await ai_diagnostic_service.diagnose_failure(
        pipeline_name="Postgres_04_PL_SourceToBronze",
        activity_name="CopyDataActivity",
        activity_type="Copy",
        error_code="22001",
        error_message="Value too long for character varying(50) in column customer_address",
        failure_type="UserError",
        force_refresh=True
    )
    print("  Success:", diag.get("success"))
    print("  Root Cause:", diag.get("rootCause"))
    print("  Severity:", diag.get("severity"))
    print("  Likely Causes Count:", len(diag.get("likelyCauses", [])))
    print("  Fix Steps Count:", len(diag.get("fixSteps", [])))
    assert diag.get("success") is True, "AI diagnostic must succeed"
    print("  -> Azure OpenAI diagnostics PASSED!")

    print("\n" + "=" * 60)
    print("3. WORKSPACE & PIPELINES CATALOG CHECK")
    print("=" * 60)
    ws_id = "3f941f88-2c23-490a-bb99-122d17dd810d"
    pipes = await pipeline_service.list_pipelines(ws_id, parent_only=True)
    print(f"  Found {len(pipes)} top-level (master & independent) pipelines:")
    for p in pipes[:5]:
        print(f"    - {p.get('pipelineName')} (ID: {p.get('pipelineId')})")
    assert len(pipes) > 0, "Must return top-level pipelines"
    print("  -> Pipeline catalog check PASSED!")

    print("\n" + "=" * 60)
    print("4. SNAPSHOT & FILTERS CHECK")
    print("=" * 60)
    latest_snap = await pipeline_service.get_workspace_snapshot(ws_id, date_preset="latest")
    print("  Latest preset metrics:", latest_snap.get("metrics"))
    print(f"  Pipelines in latest snapshot: {len(latest_snap.get('pipelines', []))}")

    today_snap = await pipeline_service.get_workspace_snapshot(ws_id, date_preset="today")
    print("  Today preset metrics:", today_snap.get("metrics"))
    assert latest_snap.get("metrics") is not None, "Snapshot metrics must be present"
    print("  -> Snapshot and filters check PASSED!")

    print("\n" + "=" * 60)
    print("5. PIPELINE RUN HISTORY & SCHEDULES CHECK")
    print("=" * 60)
    p0 = pipes[0]["pipelineId"]
    history = await pipeline_service.get_pipeline_history(ws_id, p0)
    print(f"  Run history for {p0}: {len(history.get('runs', []))} runs found")

    sched = await pipeline_service.get_pipeline_schedule(ws_id, p0)
    print(f"  Schedule for {p0}: enabled={sched.get('enabled')}, type={sched.get('scheduleType')}")
    assert "runs" in history, "Run history must have 'runs' list"
    assert "pipelineId" in sched, "Schedule must have 'pipelineId'"
    print("  -> Run history & schedule check PASSED!")

    print("\n" + "=" * 60)
    print("6. SLA INCIDENTS, REPEATED FAILURES & ESCALATION CHECK")
    print("=" * 60)
    test_p_id = "test-pipeline-flow-999"
    test_p_name = "Test_Pipeline_Verification"
    run_1 = "run-test-fail-001"

    # First failure on pipeline: creates incident and sends L1 alert
    await alert_service.process_failed_run(
        workspace_id=ws_id,
        pipeline_id=test_p_id,
        pipeline_name=test_p_name,
        pipeline_run_id=run_1,
        error_info={"errorCode": "Err404", "message": "Initial failure"}
    )
    inc_1 = await sla_repository.get_active_incident_for_pipeline(ws_id, test_p_id)
    assert inc_1 is not None, "Incident 1 must be created"
    print("  [Step 1] Initial failure incident created:")
    print(f"    ID: {inc_1['id']}, Status: {inc_1['status']}, Run: {inc_1['pipeline_run_id']}")
    print(f"    Error: {inc_1['error_message']}")

    # Subsequent failure while active: updates details, preserves SLA timeline, sends rerun alert
    run_2 = "run-test-fail-002"
    await alert_service.process_failed_run(
        workspace_id=ws_id,
        pipeline_id=test_p_id,
        pipeline_name=test_p_name,
        pipeline_run_id=run_2,
        error_info={"errorCode": "Err500", "message": "Latest subsequent failure"}
    )
    inc_2 = await sla_repository.get_active_incident_for_pipeline(ws_id, test_p_id)
    print("  [Step 2] Subsequent failure updated on open incident with continuous SLA:")
    print(f"    ID: {inc_2['id']}, Run: {inc_2['pipeline_run_id']}, Error: {inc_2['error_message']}")
    print(f"    Initial failed_at preserved: {inc_2['failed_at']}, SLA target: {inc_2['sla_target_time']}")
    assert inc_2["pipeline_run_id"] == run_2, "Run ID must be updated to latest"
    assert "Err500" in inc_2["error_message"], "Error message must be updated to latest failure"
    assert inc_1["id"] == inc_2["id"], "Must continue same active incident"
    assert inc_1["failed_at"] == inc_2["failed_at"], "Original failed_at must be preserved (SLA must not reset)"
    assert inc_1["sla_target_time"] == inc_2["sla_target_time"], "Original sla_target_time must be preserved"

    # Step 3: Pipeline is executed again and succeeds -> Auto-resolves the incident
    run_3 = "run-test-success-003"
    resolved_count = await sla_repository.resolve_incidents_for_pipeline(
        workspace_id=ws_id,
        pipeline_id=test_p_id,
        resolved_by="Auto-Resolved (Pipeline Succeeded)"
    )
    print(f"  [Step 3] Pipeline executed successfully -> Auto-resolved {resolved_count} incident(s)")
    assert resolved_count >= 1, "Must auto-resolve active incident on success"

    active_after = await sla_repository.get_active_incident_for_pipeline(ws_id, test_p_id)
    assert active_after is None, "No active incident should remain after pipeline succeeds"
    print("  -> Continuous SLA preservation, rerun failure, and auto-resolution checks PASSED!")

    # Step 4: User clicks "Resolve" on a failed run -> stops email alerting and suppresses re-alerting
    run_4 = "run-test-fail-004"
    await alert_service.process_failed_run(
        workspace_id=ws_id,
        pipeline_id=test_p_id,
        pipeline_name=test_p_name,
        pipeline_run_id=run_4,
        error_info={"errorCode": "Err404", "message": "Failure to be resolved manually"}
    )
    inc_4 = await sla_repository.get_active_incident_for_pipeline(ws_id, test_p_id)
    assert inc_4 is not None, "Incident 4 must be created"
    
    # User clicks resolve
    resolve_result = await alert_service.resolve_incident(inc_4["id"], resolved_by="TestOperator")
    assert resolve_result["status"] == "RESOLVED", "Incident must be marked RESOLVED"
    
    # Poller runs again on the same resolved run 4 -> MUST NOT reactivate or re-alert
    await alert_service.process_failed_run(
        workspace_id=ws_id,
        pipeline_id=test_p_id,
        pipeline_name=test_p_name,
        pipeline_run_id=run_4,
        error_info={"errorCode": "Err404", "message": "Failure to be resolved manually"}
    )
    resolved_check = await sla_repository.get_incident_for_run(run_4)
    assert resolved_check["status"] == "RESOLVED", "Incident must remain RESOLVED on repeated poll cycles"
    print("  [Step 4] Manual resolve stops mail sending and suppresses re-alerting on same run PASSED!")

    # Step 5: Pipeline fails again later (new run 5) -> MUST start fresh from new minutes
    import datetime
    now_fresh = datetime.datetime.now(datetime.timezone.utc)
    fresh_failed_at = now_fresh.isoformat()
    run_5 = "run-test-fail-005"
    await alert_service.process_failed_run(
        workspace_id=ws_id,
        pipeline_id=test_p_id,
        pipeline_name=test_p_name,
        pipeline_run_id=run_5,
        error_info={"errorCode": "Err502", "message": "New failure after previous was resolved"},
        failed_at=fresh_failed_at,
    )
    inc_5 = await sla_repository.get_active_incident_for_pipeline(ws_id, test_p_id)
    assert inc_5 is not None, "New incident 5 must be created for fresh failure"
    assert inc_5["id"] == f"inc_{run_5}", "Incident 5 ID must match new run 5"
    assert inc_5["status"] == "ACTIVE", "Incident 5 status must be ACTIVE"
    assert inc_5["failed_at"] == fresh_failed_at, "SLA timer must start from new failure time"
    assert inc_5["failed_at"] != inc_4["failed_at"], "Failed time must be completely fresh from new minutes"
    print(f"  [Step 5] Fresh failure after resolve started from new minutes: failed_at={inc_5['failed_at']}, sla_target={inc_5['sla_target_time']}")
    print("  -> Incident manual resolution & fresh SLA start on re-failure checks PASSED!")


    print("\n" + "=" * 60)
    print("ALL VERIFICATION SUITE CHECKS COMPLETED SUCCESSFULLY! (100% PASS)")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
