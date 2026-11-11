import asyncio
import datetime
import logging
import sys
import time
from typing import Any, Dict, List, Optional
from core.config import settings
from .alert_service import alert_service
from .db_service import db_service
from .fabric_service import fabric_service

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

logger = logging.getLogger("azure_watchdog.engine")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


def format_watchdog_table(
    num_pipelines: int,
    num_workspaces: int,
    active_failed: int,
    manual_resolved: int,
    l1_alerts: int,
    l2_alerts: int,
    sla2_breaches: int,
    loop_mails: int,
    duration_ms: int,
) -> str:
    """Renders a clean ASCII summary table of the watchdog telemetry sweep."""
    rows = [
        ("L1 & L2 Configured Pipelines", f"{num_pipelines} in {num_workspaces} workspace(s)"),
        ("Pipelines Failed (Active / Unresolved)", f"{active_failed} failed"),
        ("Pipelines Failed & Resolved (Manual)", f"{manual_resolved} resolved"),
        ("L1 Alerts Dispatched", f"{l1_alerts} sent"),
        ("L2 Alerts Dispatched (SLA1 Breach)", f"{l2_alerts} sent"),
        ("L1 + L2 Alerts Dispatched (SLA2 Breach)", f"{sla2_breaches} sent"),
        ("Loop Mail (30m Recurring Cycle)", f"{loop_mails} active" if loop_mails > 0 else "0 active"),
    ]

    col1_w = 46
    col2_w = 26
    total_inner = col1_w + col2_w + 3

    top_border     = f"┌{'─' * total_inner}┐"
    title_row      = f"│ {'MICROSOFT FABRIC 24/7 AUTONOMOUS WATCHDOG TELEMETRY'.center(total_inner - 2)} │"
    header_sep_top = f"├{'─' * (col1_w + 2)}┬{'─' * (col2_w + 2)}┤"
    header_row     = f"│ {'METRIC'.ljust(col1_w)} │ {'STATUS / COUNT'.ljust(col2_w)} │"
    header_sep_bot = f"├{'─' * (col1_w + 2)}┼{'─' * (col2_w + 2)}┤"
    mid_sep        = f"├{'─' * (col1_w + 2)}┴{'─' * (col2_w + 2)}┤"
    footer_text    = f"Sweep Execution: {duration_ms}ms  •  HTTP Logging: Suppressed"
    footer_row     = f"│ {footer_text.center(total_inner - 2)} │"
    bot_border     = f"└{'─' * total_inner}┘"

    lines = [
        "",
        top_border,
        title_row,
        header_sep_top,
        header_row,
        header_sep_bot,
    ]

    for label, val in rows:
        lines.append(f"│ {label.ljust(col1_w)} │ {val.ljust(col2_w)} │")

    lines.append(mid_sep)
    lines.append(footer_row)
    lines.append(bot_border)

    return "\n".join(lines)


class WatchdogEngine:
    """
    Autonomous 24/7 Watchdog Engine running in Azure Functions.
    
    Business Rules:
    1. Directly queries sla_configs table for all pipelines configured with L1 or L2 support personnel.
       (Since all workspace IDs and pipeline IDs are already persisted in sla_configs, redundant
       tenant-wide workspace pagination is completely eliminated).
    2. Concurrently checks latest execution runs of ONLY these configured pipelines in Microsoft Fabric.
    3. Dispatches alerts based on SLA1 and SLA2 escalation rules:
       - Initial Failure: Creates incident and sends exactly one L1 alert to L1 email.
       - Re-run Failure: Updates incident details while maintaining uninterrupted SLA timeline.
       - SLA1 Breached: Escalates to L2 email warning that fix is needed before SLA2.
       - SLA2 Breached: Dispatches Critical SLA2 Breach alert to BOTH L1 and L2 leads.
       - Ongoing Breach: Sends 30-minute recurring reminder to BOTH L1 and L2 until resolved.
       - Recovery: On successful pipeline execution, marks incident RESOLVED in DB (no emails sent).
    """

    def __init__(self):
        self._last_critical_reminders: Dict[str, float] = {}

    async def run_watchdog_sweep(self) -> Dict[str, Any]:
        """
        Executes a 24/7 autonomous sweep:
        1. Queries database for pipelines with configured L1/L2 support.
        2. Inspects latest execution run of each configured pipeline directly.
        3. Handles failures, recoveries, and SLA1/SLA2 multi-tier escalations.
        """
        start_ts = time.time()
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        now_iso = now_utc.isoformat()

        stats = {
            "timestamp": now_iso,
            "pipelinesConfiguredInDB": 0,
            "pipelinesChecked": 0,
            "failedPipelinesDetected": 0,
            "newL1AlertsSent": 0,
            "rerunFailuresDetected": 0,
            "l2EscalationsTriggered": 0,
            "sla2BreachesTriggered": 0,
            "criticalRemindersSent": 0,
            "recoveriesResolved": 0,
            "durationMs": 0,
        }

        # ── Step 1: Query Configured SLA Pipelines from Database ────────────
        configured_pipelines = await db_service.get_configured_sla_pipelines()
        stats["pipelinesConfiguredInDB"] = len(configured_pipelines)

        if not configured_pipelines:
            await self.evaluate_sla_escalations(now_utc, stats)
            stats["durationMs"] = int((time.time() - start_ts) * 1000)
            inc_summary = await db_service.get_watchdog_incident_summary()
            table_str = format_watchdog_table(
                num_pipelines=0,
                num_workspaces=0,
                active_failed=inc_summary.get("activeFailures", 0),
                manual_resolved=inc_summary.get("manuallyResolved", 0),
                l1_alerts=inc_summary.get("l1AlertsTotal", 0),
                l2_alerts=inc_summary.get("l2AlertsTotal", 0),
                sla2_breaches=inc_summary.get("sla2BreachesTotal", 0),
                loop_mails=inc_summary.get("loopMailsPending", 0),
                duration_ms=stats["durationMs"],
            )
            logger.info(table_str)
            return stats

        # ── Step 2: Check Configured Pipelines Concurrently ─────────────────
        semaphore = asyncio.Semaphore(10)  # Concurrency throttle against Fabric REST API

        async def _check_pipeline(sla_cfg: Dict[str, Any]):
            ws_id = sla_cfg.get("workspaceId")
            pid = sla_cfg.get("pipelineId")
            pname = sla_cfg.get("pipelineName") or "Data Pipeline"
            if not ws_id or not pid:
                return

            async with semaphore:
                recent_runs = await fabric_service.get_recent_pipeline_runs(ws_id, pid, pname, limit=10)

            if not recent_runs:
                return

            stats["pipelinesChecked"] += 1
            latest_run = recent_runs[0]
            run_id = str(latest_run.get("id") or "")
            raw_status = str(latest_run.get("status") or "").lower()

            if not run_id or run_id.startswith("norun-"):
                return

            # Case A: Latest Run Succeeded / Recovered
            if raw_status in ("completed", "succeeded", "success"):
                await self.handle_recovered_run(ws_id, pid, pname, run_id, stats)

            # Case B: Latest Run Failed
            elif raw_status in ("failed", "failure"):
                stats["failedPipelinesDetected"] += 1
                await self.handle_failed_run(
                    ws_id, pid, pname, run_id, latest_run, now_utc, stats, sla_cfg, recent_runs
                )

        await asyncio.gather(*[_check_pipeline(cfg) for cfg in configured_pipelines], return_exceptions=True)

        # ── Step 3: Evaluate SLA1 & SLA2 Escalations from Database ───────────
        await self.evaluate_sla_escalations(now_utc, stats)

        stats["durationMs"] = int((time.time() - start_ts) * 1000)

        # ── Step 4: Render Single Clean Watchdog Telemetry Table ─────────────
        inc_summary = await db_service.get_watchdog_incident_summary()
        unique_ws = {cfg.get("workspaceId") for cfg in configured_pipelines if cfg.get("workspaceId")}
        table_str = format_watchdog_table(
            num_pipelines=len(configured_pipelines),
            num_workspaces=len(unique_ws),
            active_failed=inc_summary.get("activeFailures", 0),
            manual_resolved=inc_summary.get("manuallyResolved", 0),
            l1_alerts=inc_summary.get("l1AlertsTotal", 0),
            l2_alerts=inc_summary.get("l2AlertsTotal", 0),
            sla2_breaches=inc_summary.get("sla2BreachesTotal", 0),
            loop_mails=inc_summary.get("loopMailsPending", 0),
            duration_ms=stats["durationMs"],
        )
        logger.info(table_str)
        return stats

    async def handle_failed_run(
        self,
        workspace_id: str,
        pipeline_id: str,
        pipeline_name: str,
        run_id: str,
        run_data: Dict[str, Any],
        now_utc: datetime.datetime,
        stats: Dict[str, Any],
        sla_cfg: Optional[Dict[str, Any]] = None,
        recent_runs: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """
        Processes a detected pipeline failure.
        Ensures exactly one L1 alert email is dispatched per initial incident,
        prevents alert storms on repeated broken re-runs, and maintains uninterrupted SLA timeline.
        """
        existing_run_inc = await db_service.get_incident_for_run(run_id)
        existing_pipe_inc = await db_service.get_active_incident_for_pipeline(workspace_id, pipeline_id)

        target_inc = existing_run_inc or (
            existing_pipe_inc if existing_pipe_inc and existing_pipe_inc.get("pipelineRunId") == run_id else None
        )

        # If incident for this run already exists, ensure L1 alert was recorded
        if target_inc:
            if target_inc.get("status") == "RESOLVED" or target_inc.get("l1NotifiedAt"):
                return
            # Retry transient email failure if L1 was not yet notified
            if not sla_cfg:
                sla_cfg = await db_service.get_sla_config(workspace_id, pipeline_id)
            l1_email = (sla_cfg.get("l1Email") or "").strip()
            if l1_email:
                sla1_minutes = sla_cfg.get("sla1Minutes", settings.DEFAULT_SLA1_MINUTES)
                err_info = run_data.get("failureReason") or await fabric_service.query_failure_diagnostics(
                    workspace_id, pipeline_id, run_id
                )
                sla_target = target_inc.get("slaTargetTime") or now_utc.isoformat()
                failed_time = target_inc.get("failedAt") or target_inc.get("failed_at") or now_utc.isoformat()
                sent = await alert_service.send_l1_failure_alert(
                    pipeline_name=pipeline_name,
                    run_id=run_id,
                    workspace_id=workspace_id,
                    err_info=err_info,
                    sla1_target=sla_target,
                    sla1_minutes=sla1_minutes,
                    l1_email=l1_email,
                    pipeline_id=pipeline_id,
                    failed_at=failed_time,
                )
                if sent:
                    stats["newL1AlertsSent"] += 1
                    await db_service.update_incident(target_inc["id"], {
                        "l1_notified_at": now_utc.isoformat(),
                        "updated_at": now_utc.isoformat(),
                    })
                    logger.info(f"Delivered pending L1 alert for incident {target_inc['id']} to {l1_email}")
            return

        # If there is already an active/escalated incident for this pipeline
        if existing_pipe_inc:
            old_failed_at = str(existing_pipe_inc.get("failedAt") or existing_pipe_inc.get("failed_at") or "")
            new_run_start = str(run_data.get("startTimeUtc") or run_data.get("startTime") or "")

            had_success_in_between = False
            if recent_runs and old_failed_at:
                for r in recent_runs:
                    r_st = str(r.get("status") or "").lower()
                    if r_st in ("completed", "succeeded", "success"):
                        r_time = str(r.get("startTimeUtc") or r.get("startTime") or r.get("endTimeUtc") or "")
                        if r_time > old_failed_at[:19] and (not new_run_start or r_time <= new_run_start[:19]):
                            had_success_in_between = True
                            break

            if had_success_in_between:
                # The old incident had an intermediate success run; resolve it and treat run as fresh failure
                await db_service.resolve_incidents_for_pipeline(
                    workspace_id=workspace_id,
                    pipeline_id=pipeline_id,
                    resolved_by=f"Auto-Resolved (Intermediate success prior to run {run_id})",
                )
                logger.info(
                    f"Auto-resolved prior incident for {pipeline_name} due to intermediate success. "
                    f"Treating run {run_id} as a fresh failure."
                )
                existing_pipe_inc = None
            else:
                # True re-run while still broken: update ongoing incident without spamming duplicate initial alerts
                stats["rerunFailuresDetected"] += 1
                inc_id = existing_pipe_inc["id"]

                err_info = run_data.get("failureReason") or await fabric_service.query_failure_diagnostics(
                    workspace_id, pipeline_id, run_id
                )
                err_msg = f"[{err_info.get('errorCode', 'Failed')}] {err_info.get('message', 'Pipeline failed.')}"

                await db_service.update_incident(inc_id, {
                    "pipeline_run_id": run_id,
                    "error_message": err_msg,
                    "updated_at": now_utc.isoformat(),
                })
                logger.info(
                    f"Updated ongoing incident {inc_id} ({pipeline_name}) with latest failed run {run_id}. "
                    f"No duplicate rerun email sent. Ongoing SLA continues."
                )
                return

        # ── Fresh Failure: Create Incident and Dispatch Exactly ONE L1 Alert ────
        if not sla_cfg:
            sla_cfg = await db_service.get_sla_config(workspace_id, pipeline_id)
        sla1_minutes = sla_cfg.get("sla1Minutes", settings.DEFAULT_SLA1_MINUTES)
        l1_email = (sla_cfg.get("l1Email") or "").strip()

        failed_time_str = (
            run_data.get("endTimeUtc")
            or run_data.get("endTime")
            or run_data.get("startTimeUtc")
            or now_utc.isoformat()
        )

        try:
            clean_str = failed_time_str.replace("Z", "+00:00")
            failed_dt = datetime.datetime.fromisoformat(clean_str)
            if failed_dt.tzinfo is None:
                failed_dt = failed_dt.replace(tzinfo=datetime.timezone.utc)
        except Exception:
            failed_dt = now_utc

        target_dt = failed_dt + datetime.timedelta(minutes=sla1_minutes)
        sla_target_time = target_dt.isoformat()
        clean_failed_time = failed_dt.isoformat()

        err_info = run_data.get("failureReason") or await fabric_service.query_failure_diagnostics(
            workspace_id, pipeline_id, run_id
        )
        err_msg = f"[{err_info.get('errorCode', 'Failed')}] {err_info.get('message', 'Pipeline execution failed.')}"

        incident_id = f"inc_{run_id}"
        incident_data = {
            "id": incident_id,
            "pipelineId": pipeline_id,
            "pipelineName": pipeline_name,
            "pipelineRunId": run_id,
            "workspaceId": workspace_id,
            "status": "ACTIVE",
            "failedAt": clean_failed_time,
            "slaTargetTime": sla_target_time,
            "l1NotifiedAt": None,
            "l2EscalatedAt": None,
            "resolvedAt": None,
            "resolvedBy": None,
            "errorMessage": err_msg,
            "failedActivity": err_info.get("target") or pipeline_name,
            "updatedAt": now_utc.isoformat(),
        }

        await db_service.create_incident(incident_data)

        # Dispatch exactly ONE L1 alert email
        if l1_email:
            sent = await alert_service.send_l1_failure_alert(
                pipeline_name=pipeline_name,
                run_id=run_id,
                workspace_id=workspace_id,
                err_info=err_info,
                sla1_target=sla_target_time,
                sla1_minutes=sla1_minutes,
                l1_email=l1_email,
                pipeline_id=pipeline_id,
                failed_at=clean_failed_time,
            )
            if sent:
                stats["newL1AlertsSent"] += 1
                now_str = now_utc.isoformat()
                await db_service.update_incident(incident_id, {
                    "l1_notified_at": now_str,
                    "updated_at": now_str,
                })
                logger.info(f"Dispatched initial L1 alert for {pipeline_name} (Run: {run_id}) to {l1_email}")
            else:
                logger.error(f"Failed to deliver initial L1 alert for {pipeline_name} (Run: {run_id}). Will retry.")

    async def handle_recovered_run(
        self,
        workspace_id: str,
        pipeline_id: str,
        pipeline_name: str,
        run_id: str,
        stats: Dict[str, Any],
    ) -> None:
        """
        Auto-resolves incidents in the database when a pipeline succeeds on re-run.
        No recovery emails are dispatched.
        """
        resolved_count = await db_service.resolve_incidents_for_pipeline(
            workspace_id=workspace_id,
            pipeline_id=pipeline_id,
            resolved_by=f"Auto-Resolved (Pipeline Succeeded Run {run_id})",
        )

        if resolved_count > 0:
            stats["recoveriesResolved"] += resolved_count
            logger.info(
                f"[PIPELINE RECOVERED] {pipeline_name} succeeded on Run {run_id}. "
                f"Auto-resolved {resolved_count} incident(s) in DB."
            )

    async def evaluate_sla_escalations(self, now_utc: datetime.datetime, stats: Dict[str, Any]) -> None:
        """
        Evaluates active incidents against SLA1 and SLA2 deadlines.
        - SLA1 expired without resolution -> Escalates incident to L2 (warning L2 needs fix before SLA2).
        - SLA2 expired without resolution -> Escalates to Critical and alerts BOTH L1 and L2 leads.
        - Critical unresolved -> Dispatches 30-minute recurring reminders to BOTH L1 and L2 until resolved.
        """
        active_incidents = await db_service.get_all_unresolved_incidents()
        CRITICAL_REMINDER_SECONDS = settings.CRITICAL_REMINDER_MINUTES * 60

        for inc in active_incidents:
            inc_id = inc["id"]
            inc_status = inc.get("status")
            p_id = inc.get("pipelineId") or inc.get("pipeline_id") or ""
            p_name = inc.get("pipelineName", "Data Pipeline")
            ws_id = inc.get("workspaceId", "")
            run_id = inc.get("pipelineRunId", "")
            sla1_target_str = inc.get("slaTargetTime")
            failed_action = inc.get("failedActivity") or inc.get("failed_activity") or inc.get("target") or p_name

            if not sla1_target_str:
                continue

            try:
                clean_target = sla1_target_str.replace("Z", "+00:00")
                sla1_target_dt = datetime.datetime.fromisoformat(clean_target)
                if sla1_target_dt.tzinfo is None:
                    sla1_target_dt = sla1_target_dt.replace(tzinfo=datetime.timezone.utc)
            except Exception:
                continue

            sla_cfg = await db_service.get_sla_config(ws_id, p_id)
            sla1_minutes = sla_cfg.get("sla1Minutes", settings.DEFAULT_SLA1_MINUTES)
            sla2_minutes = sla_cfg.get("sla2Minutes", settings.DEFAULT_SLA2_MINUTES)
            l1_email = (sla_cfg.get("l1Email") or "").strip()
            l2_email = (sla_cfg.get("l2Email") or "").strip()

            # Skip unconfigured pipelines so we only escalate for configured personnel
            if not l1_email and not l2_email:
                continue

            recipients = list(dict.fromkeys(filter(None, [l1_email, l2_email])))
            both_emails = ",".join(recipients)

            failed_at_str = inc.get("failedAt") or inc.get("failed_at") or sla1_target_str
            try:
                clean_fail = failed_at_str.replace("Z", "+00:00")
                failed_dt = datetime.datetime.fromisoformat(clean_fail)
                if failed_dt.tzinfo is None:
                    failed_dt = failed_dt.replace(tzinfo=datetime.timezone.utc)
            except Exception:
                failed_dt = sla1_target_dt

            # SLA2 Target Time Calculation:
            # If sla2_minutes > sla1_minutes (e.g. SLA1=30m, SLA2=60m), SLA2 is measured from initial failure.
            # If sla2_minutes <= sla1_minutes (incremental window), SLA2 is measured from SLA1 deadline.
            if sla2_minutes > sla1_minutes:
                sla2_target_dt = failed_dt + datetime.timedelta(minutes=sla2_minutes)
            else:
                sla2_target_dt = sla1_target_dt + datetime.timedelta(minutes=sla2_minutes)

            # ── Prerequisite Check: Ensure Initial Pipeline Failure Mail Dispatched ──
            # Before dispatching SLA1 (L2 escalation) or SLA2 (L1+L2 breach) emails,
            # verify that the initial Pipeline Failure email (l1NotifiedAt) has already been dispatched.
            l1_notified = inc.get("l1NotifiedAt") or inc.get("l1_notified_at")
            if not l1_notified and l1_email:
                logger.info(
                    f"Incident {inc_id} ({p_name}) missing initial pipeline failure notification. "
                    f"Dispatching initial pipeline failure alert to L1 ({l1_email}) before evaluating escalations."
                )
                err_msg = inc.get("errorMessage") or "Pipeline execution failed."
                err_info = {
                    "errorCode": "PipelineFailure",
                    "message": err_msg,
                    "target": failed_action,
                }
                sent = await alert_service.send_l1_failure_alert(
                    pipeline_name=p_name,
                    run_id=run_id,
                    workspace_id=ws_id,
                    err_info=err_info,
                    sla1_target=sla1_target_str,
                    sla1_minutes=sla1_minutes,
                    l1_email=l1_email,
                    pipeline_id=p_id,
                    failed_at=failed_at_str,
                )
                if sent:
                    now_str = now_utc.isoformat()
                    await db_service.update_incident(inc_id, {
                        "l1_notified_at": now_str,
                        "updated_at": now_str,
                    })
                    inc["l1NotifiedAt"] = now_str
                    inc["l1_notified_at"] = now_str
                    l1_notified = now_str
                    stats["newL1AlertsSent"] += 1
                    logger.info(f"Delivered prerequisite pipeline failure alert for incident {inc_id} to {l1_email}.")
                else:
                    logger.warning(
                        f"Failed to deliver prerequisite pipeline failure alert for incident {inc_id} to {l1_email}. "
                        f"Withholding SLA escalations until initial notification is dispatched."
                    )
                    continue

            # ── Condition 1: SLA1 Breached -> Escalate to L2 Lead ─────────────────
            if inc_status == "ACTIVE" and now_utc >= sla1_target_dt:
                # Strictly verify initial failure notification was dispatched before L2 escalation
                if l1_email and not l1_notified:
                    logger.warning(
                        f"Withholding L2 escalation for {inc_id} ({p_name}): "
                        f"Initial pipeline failure email (L1) has not been confirmed dispatched."
                    )
                    continue

                overdue_min_l1 = max(0, int((now_utc - sla1_target_dt).total_seconds()) // 60)
                logger.warning(
                    f"[SLA1 BREACHED] Incident {inc_id} ({p_name}) is +{overdue_min_l1}m overdue! Escalating to L2."
                )

                sent_ok = False
                if l2_email:
                    sent_ok = await alert_service.send_l2_escalation_alert(
                        pipeline_name=p_name,
                        run_id=run_id,
                        workspace_id=ws_id,
                        failed_at=failed_at_str,
                        sla1_target=sla1_target_str,
                        overdue_min=overdue_min_l1,
                        sla2_target=sla2_target_dt.isoformat(),
                        sla2_min=sla2_minutes,
                        l2_email=l2_email,
                        err_msg=inc.get("errorMessage", "Pipeline failed."),
                        pipeline_id=p_id,
                        failed_action=failed_action,
                    )

                if sent_ok or not l2_email:
                    now_str = now_utc.isoformat()
                    await db_service.update_incident(inc_id, {
                        "status": "ESCALATED_L2",
                        "l2_escalated_at": now_str,
                        "updated_at": now_str,
                    })
                    inc_status = "ESCALATED_L2"
                    inc["l2EscalatedAt"] = now_str
                    inc["l2_escalated_at"] = now_str
                    stats["l2EscalationsTriggered"] += 1
                else:
                    logger.error(f"Failed to dispatch L2 escalation email for {inc_id}. Will retry on next sweep.")

            # ── Condition 2: SLA2 Breached -> Critical Alert to BOTH L1 & L2 ──────
            if inc_status == "ESCALATED_L2" and now_utc >= sla2_target_dt:
                # Strictly verify initial failure notification was dispatched before L1+L2 critical alert
                if l1_email and not l1_notified:
                    logger.warning(
                        f"Withholding L1+L2 critical alert for {inc_id} ({p_name}): "
                        f"Initial pipeline failure email (L1) has not been confirmed dispatched."
                    )
                    continue

                # Strictly verify SLA1/L2 escalation email was dispatched before L1+L2 critical alert
                l2_notified = inc.get("l2EscalatedAt") or inc.get("l2_escalated_at")
                if l2_email and not l2_notified:
                    logger.warning(
                        f"Withholding L1+L2 critical alert for {inc_id} ({p_name}): "
                        f"Prerequisite L2 escalation email has not been confirmed dispatched."
                    )
                    continue

                overdue_min_sla2 = max(0, int((now_utc - sla2_target_dt).total_seconds()) // 60)
                logger.critical(
                    f"[SLA2 BREACHED] Incident {inc_id} ({p_name}) breached SLA2 (+{overdue_min_sla2}m)! Mails to both L1 & L2."
                )

                sent_ok = False
                if both_emails:
                    sent_ok = await alert_service.send_critical_sla2_alert(
                        pipeline_name=p_name,
                        run_id=run_id,
                        workspace_id=ws_id,
                        failed_at=failed_at_str,
                        sla1_target=sla1_target_str,
                        sla2_target=sla2_target_dt.isoformat(),
                        overdue_min=overdue_min_sla2,
                        both_emails=both_emails,
                        err_msg=inc.get("errorMessage", "Pipeline failed."),
                        pipeline_id=p_id,
                        failed_action=failed_action,
                    )

                if sent_ok or not both_emails:
                    now_str = now_utc.isoformat()
                    await db_service.update_incident(inc_id, {
                        "status": "CRITICAL_UNRESOLVED",
                        "updated_at": now_str,
                    })
                    self._last_critical_reminders[inc_id] = now_utc.timestamp()
                    stats["sla2BreachesTriggered"] += 1
                else:
                    logger.error(f"Failed to dispatch SLA2 breach alert for {inc_id}. Will retry on next sweep.")
                continue

            # ── Condition 3: CRITICAL_UNRESOLVED -> 30-min Recurring Reminder ─────
            elif inc_status == "CRITICAL_UNRESOLVED":
                last_sent = self._last_critical_reminders.get(inc_id, 0)
                if (now_utc.timestamp() - last_sent) >= CRITICAL_REMINDER_SECONDS:
                    total_overdue_min = max(0, int((now_utc - failed_dt).total_seconds()) // 60)
                    logger.critical(
                        f"[30M REMINDER] Incident {inc_id} ({p_name}) still critical ({total_overdue_min}m). Repeating alert."
                    )

                    if both_emails:
                        await alert_service.send_critical_reminder_alert(
                            pipeline_name=p_name,
                            run_id=run_id,
                            workspace_id=ws_id,
                            total_overdue_min=total_overdue_min,
                            both_emails=both_emails,
                            err_msg=inc.get("errorMessage", "Pipeline failed."),
                            pipeline_id=p_id,
                            failed_at=failed_at_str,
                            failed_action=failed_action,
                        )

                    self._last_critical_reminders[inc_id] = now_utc.timestamp()
                    await db_service.update_incident(inc_id, {"updated_at": now_utc.isoformat()})
                    stats["criticalRemindersSent"] += 1


watchdog_engine = WatchdogEngine()
