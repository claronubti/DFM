import asyncio
import datetime
import email.mime.multipart
import email.mime.text
import logging
import smtplib
import ssl
import time
from typing import Any, Dict, List, Optional, Tuple
from core.config import settings

logger = logging.getLogger("azure_watchdog.alert")


IST_TZ = datetime.timezone(datetime.timedelta(hours=5, minutes=30), name="IST")


def format_ist(val: Any) -> str:
    """
    Parses any UTC ISO timestamp string or datetime object, converts it to IST (UTC+05:30),
    and formats it cleanly as 'DD-Mon-YYYY hh:mm:ss AM/PM IST' (e.g. '13-Oct-2026 02:52:51 PM IST').
    Preserves trailing suffixes such as ' (Breached by +10m)' or ' (Breached)'.
    """
    if not val:
        return "N/A"

    suffix = ""
    val_str = str(val).strip()

    # Separate any trailing parenthetical suffix like " (Breached by +15m)" or " (Breached)"
    if " (" in val_str and val_str.endswith(")"):
        parts = val_str.rsplit(" (", 1)
        val_str = parts[0].strip()
        suffix = " (" + parts[1]

    raw_iso = val_str.replace("Z", "+00:00")
    if "." in raw_iso:
        base, frac = raw_iso.split(".", 1)
        tz_part = ""
        for tz_sep in ["+", "-"]:
            if tz_sep in frac:
                idx = frac.index(tz_sep)
                tz_part = frac[idx:]
                frac = frac[:idx]
                break
        frac = frac[:6]
        raw_iso = f"{base}.{frac}{tz_part}"

    try:
        dt = datetime.datetime.fromisoformat(raw_iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        ist_dt = dt.astimezone(IST_TZ)
        return ist_dt.strftime("%d-%b-%Y %I:%M:%S %p IST") + suffix
    except Exception:
        return val_str + suffix


class AlertService:
    """
    Enterprise alerting engine for multi-tier SLA1/SLA2 notifications, escalations, and recoveries.
    
    Supported Notification Flows:
    1. send_l1_failure_alert: Dispatched immediately upon initial pipeline failure to L1 lead.
    2. send_l2_escalation_alert: Dispatched when SLA1 expires without resolution to L2 lead.
    3. send_critical_sla2_alert: Dispatched when SLA2 expires to BOTH L1 and L2 leads.
    4. send_critical_reminder_alert: Dispatched every 30 minutes to BOTH L1 and L2 leads until resolved.
    """

    def send_smtp_email_sync(self, to_email: str, subject: str, html_body: str, plain_body: str) -> bool:
        """
        Synchronously delivers an alert email notification over SMTP with STARTTLS or SSL.
        Executed within a separate worker thread via asyncio.to_thread to avoid blocking the event loop.
        """
        if not to_email:
            logger.warning("Alert suppressed: No recipient email provided.")
            return False

        seen = set()
        recipients = []
        for e in to_email.replace(";", ",").split(","):
            clean = e.strip()
            if clean and clean.lower() not in seen:
                seen.add(clean.lower())
                recipients.append(clean)

        if not recipients:
            logger.warning("No valid recipient emails parsed.")
            return False

        try:
            msg = email.mime.multipart.MIMEMultipart("alternative")
            msg["Subject"] = subject
            sender_email = settings.MAIL_FROM or settings.clean_mail_username
            msg["From"] = sender_email
            msg["To"] = ", ".join(recipients)
            msg["Date"] = datetime.datetime.now(datetime.timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")

            part1 = email.mime.text.MIMEText(plain_body, "plain", "utf-8")
            part2 = email.mime.text.MIMEText(html_body, "html", "utf-8")
            msg.attach(part1)
            msg.attach(part2)

            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE

            for attempt in range(1, 3):
                try:
                    if settings.MAIL_SSL_TLS:
                        with smtplib.SMTP_SSL(settings.MAIL_SERVER, settings.MAIL_PORT, context=ssl_ctx, timeout=30) as server:
                            if settings.USE_CREDENTIALS:
                                server.login(settings.clean_mail_username, settings.clean_mail_password)
                            server.sendmail(sender_email, recipients, msg.as_string())
                    else:
                        with smtplib.SMTP(settings.MAIL_SERVER, settings.MAIL_PORT, timeout=30) as server:
                            if settings.MAIL_STARTTLS:
                                server.starttls(context=ssl_ctx)
                            if settings.USE_CREDENTIALS:
                                server.login(settings.clean_mail_username, settings.clean_mail_password)
                            server.sendmail(sender_email, recipients, msg.as_string())

                    logger.info(f"Successfully dispatched alert email to {recipients} — Subject: {subject}")
                    return True
                except Exception as attempt_err:
                    if attempt < 2:
                        logger.warning(f"SMTP dispatch attempt {attempt} failed ({attempt_err}). Retrying...")
                        time.sleep(1.0)
                    else:
                        raise attempt_err
        except Exception as e:
            logger.error(f"Failed to dispatch alert email to {recipients}: {e}")
            return False

    async def send_email(self, to_email: str, subject: str, html_body: str, plain_body: str) -> bool:
        """
        Asynchronously dispatches an email notification by delegating to a worker thread.
        """
        return await asyncio.to_thread(self.send_smtp_email_sync, to_email, subject, html_body, plain_body)

    @staticmethod
    def _build_email_html(
        recipient_email: str,
        intro_message: str,
        section_title: str,
        details: List[Tuple[str, str]],
        reply_title: str,
        reply_content: str,
        link_url: str,
        link_text: str = "View Failure Details in Dashboard",
        banner_text: Optional[str] = None,
        banner_type: str = "info",
    ) -> str:
        """
        Renders a clean, corporate white-and-blue email template:
        - Greeting ('Hi {recipient},')
        - Intro description message
        - Optional soft alert banner
        - Two-column details table (soft-blue header cells `#ebf3f8`, white data cells, subtle border `#cce0eb`)
        - Diagnostics / reply block (clean white bordered container `#cce0eb`, `#ffffff`)
        - Direct underlined dashboard link
        - Support team sign-off
        """
        first_recipient = recipient_email.replace(";", ",").split(",")[0].strip()
        recipient_name = first_recipient.split("@")[0] if "@" in first_recipient else first_recipient

        banner_html = ""
        if banner_text:
            if banner_type == "critical":
                bg = "#fef2f2"
                border = "#fecaca"
                accent = "#dc2626"
                color = "#991b1b"
            elif banner_type == "warning":
                bg = "#fffbeb"
                border = "#fde68a"
                accent = "#d97706"
                color = "#92400e"
            else:
                bg = "#eff6fc"
                border = "#cce0eb"
                accent = "#0078d4"
                color = "#004578"
            banner_html = f"""
    <div style="background-color: {bg}; border: 1px solid {border}; border-left: 4px solid {accent}; color: {color}; padding: 10px 14px; border-radius: 3px; font-size: 13px; font-weight: 600; margin: 0 0 16px 0;">
      {banner_text}
    </div>"""

        rows_html = "".join(
            f"""
      <tr>
        <td style="background-color: #ebf3f8; color: #000000; font-weight: 700; padding: 10px 14px; border: 1px solid #cce0eb; width: 32%; vertical-align: middle; font-size: 13px;">{label}</td>
        <td style="background-color: #ffffff; color: #111827; padding: 10px 14px; border: 1px solid #cce0eb; vertical-align: middle; font-size: 13px;">{val}</td>
      </tr>"""
            for label, val in details
        )

        return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>{section_title}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #000000; line-height: 1.5; font-size: 14px;">
  <div style="max-width: 650px; margin: 0; background-color: #ffffff;">
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #000000;">Hi {recipient_name},</p>
    
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #000000;">{intro_message}</p>
    
    {banner_html}
    
    <p style="margin: 20px 0 10px 0; font-weight: 700; font-size: 15px; color: #000000;">{section_title}</p>
    
    <table style="width: 100%; max-width: 650px; border-collapse: collapse; border: 1px solid #cce0eb; margin: 0 0 20px 0; font-size: 13px;">
      <tbody>
        {rows_html}
      </tbody>
    </table>
    
    <p style="margin: 20px 0 10px 0; font-weight: 700; font-size: 15px; color: #000000;">{reply_title}</p>
    
    <div style="max-width: 650px; border: 1px solid #cce0eb; background-color: #ffffff; padding: 14px 16px; min-height: 44px; font-size: 13px; color: #111827; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-break: break-word; margin: 0 0 20px 0; box-sizing: border-box;">
      {reply_content}
    </div>
    
    <p style="margin: 20px 0 8px 0; font-size: 14px; color: #000000;">Please click the below link to view more details</p>
    
    <p style="margin: 0 0 24px 0;">
      <a href="{link_url}" style="color: #007799; text-decoration: underline; font-weight: 700; font-size: 15px;">{link_text}</a>
    </p>
    
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #000000; line-height: 1.5;">If you have any questions or need further assistance, please reach out to our support team at helpdesk.</p>
    
    <p style="margin: 24px 0 0 0; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px;">Microsoft Fabric Autonomous Watchdog &bull; 24/7 SLA Telemetry Monitoring</p>
  </div>
</body>
</html>""".strip()

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Initial L1 Failure Alert (Dispatched Exactly Once on Failure)
    # ──────────────────────────────────────────────────────────────────────────
    async def send_l1_failure_alert(
        self,
        pipeline_name: str,
        run_id: str,
        workspace_id: str,
        err_info: Dict[str, Any],
        sla1_target: str,
        sla1_minutes: int,
        l1_email: str,
        pipeline_id: str = "",
        failed_at: Optional[str] = None,
    ) -> bool:
        """
        Dispatches the initial L1 alert email immediately upon detecting a pipeline failure.
        Notifies only the designated L1 support engineer with the failure diagnostics and SLA countdown.
        """
        err_code = err_info.get("errorCode", "Failed")
        err_msg = err_info.get("message", "Pipeline execution failed.")
        err_target = err_info.get("target", pipeline_name)

        recipient_name = l1_email.split("@")[0] if "@" in l1_email else l1_email
        subject = f"[L1 ALERT] Pipeline Failure: {pipeline_name} (Code: {err_code})"
        display_ticket_id = f"#{run_id[:16]}" if len(run_id) > 16 else f"#{run_id}"

        failure_time_ist = format_ist(failed_at or datetime.datetime.now(datetime.timezone.utc))
        sla1_target_ist = format_ist(sla1_target)

        plain_body = f"""
Hi {recipient_name},

Our support team has detected an initial pipeline execution failure requiring L1 review:

Failure details:
Pipeline Name: {pipeline_name}
Pipeline ID: {pipeline_id or 'N/A'}
Workspace ID: {workspace_id}
Run ID: {display_ticket_id}
Failed Action: {err_target}
Failure Time (IST): {failure_time_ist}
SLA1 Target (IST): {sla1_target_ist} ({sla1_minutes}m countdown)
Action Required: L1 Review and remediation before SLA1 target ({sla1_target_ist})

Error diagnostics:
[{err_code}] {err_msg}

Please click the below link to view more details
{settings.FRONTEND_URL}

If you have any questions or need further assistance, please reach out to our support team at helpdesk.
        """.strip()

        details = [
            ("Pipeline Name", pipeline_name),
            ("Pipeline ID", pipeline_id or "N/A"),
            ("Workspace ID", workspace_id),
            ("Run ID", display_ticket_id),
            ("Failed Action", err_target),
            ("Failure Time (IST)", failure_time_ist),
            ("SLA1 Target (IST)", f"{sla1_target_ist} ({sla1_minutes}m target)"),
            ("Action Required", f"L1 Review and remediation before SLA1 target ({sla1_target_ist})"),
        ]

        html_body = self._build_email_html(
            recipient_email=l1_email,
            intro_message="Our support team has detected an initial pipeline execution failure requiring L1 review:",
            section_title="Failure details:",
            details=details,
            reply_title="Error diagnostics:",
            reply_content=f"[{err_code}] {err_msg}",
            link_url=settings.FRONTEND_URL,
            link_text="View Failure Details in Dashboard",
            banner_text="Critical L1 Alert &bull; Pipeline execution failed, SLA1 countdown active.",
            banner_type="info",
        )

        return await self.send_email(l1_email, subject, html_body, plain_body)

    # ──────────────────────────────────────────────────────────────────────────
    # 2. L2 Escalation Alert (SLA1 Breached — Tell L2 needs fix before SLA2)
    # ──────────────────────────────────────────────────────────────────────────
    async def send_l2_escalation_alert(
        self,
        pipeline_name: str,
        run_id: str,
        workspace_id: str,
        failed_at: str,
        sla1_target: str,
        overdue_min: int,
        sla2_target: str,
        sla2_min: int,
        l2_email: str,
        err_msg: str,
        pipeline_id: str = "",
        failed_action: Optional[str] = None,
    ) -> bool:
        """
        Dispatches an urgent escalation email to L2 lead when SLA1 expires without resolution.
        Notifies L2 that immediate remediation is required before the SLA2 target deadline.
        """
        recipient_name = l2_email.split("@")[0] if "@" in l2_email else l2_email
        subject = f"[URGENT L2 ESCALATION] {pipeline_name} - SLA1 Breached (+{overdue_min}m Overdue)"
        display_ticket_id = f"#{run_id[:16]}" if len(run_id) > 16 else f"#{run_id}"

        failure_time_ist = format_ist(failed_at)
        sla1_target_ist = format_ist(sla1_target)
        sla2_target_ist = format_ist(sla2_target)

        plain_body = f"""
Hi {recipient_name},

Our support team has escalated this pipeline failure to L2 lead after breaching the SLA1 resolution deadline:

Failure details:
Pipeline Name: {pipeline_name}
Pipeline ID: {pipeline_id or 'N/A'}
Workspace ID: {workspace_id}
Run ID: {display_ticket_id}
Failed Action: {failed_action or pipeline_name}
Failure Time (IST): {failure_time_ist}
SLA1 Milestone (IST): {sla1_target_ist} (Breached by +{overdue_min}m)
SLA2 Target (IST): {sla2_target_ist} ({sla2_min}m from failure)
Action Required: Immediate remediation required by L2 Lead before SLA2 deadline ({sla2_target_ist})

Error diagnostics:
{err_msg}

Please click the below link to view more details
{settings.FRONTEND_URL}

If you have any questions or need further assistance, please reach out to our support team at helpdesk.
        """.strip()

        details = [
            ("Pipeline Name", pipeline_name),
            ("Pipeline ID", pipeline_id or "N/A"),
            ("Workspace ID", workspace_id),
            ("Run ID", display_ticket_id),
            ("Failed Action", failed_action or pipeline_name),
            ("Failure Time (IST)", failure_time_ist),
            ("SLA1 Milestone (IST)", f"{sla1_target_ist} (Breached by +{overdue_min}m)"),
            ("SLA2 Target (IST)", f"{sla2_target_ist} ({sla2_min}m from failure)"),
            ("Action Required", f"Immediate remediation required by L2 Lead before SLA2 deadline ({sla2_target_ist})"),
        ]

        html_body = self._build_email_html(
            recipient_email=l2_email,
            intro_message="Our support team has escalated this pipeline failure to L2 lead after breaching the SLA1 resolution deadline:",
            section_title="Failure details:",
            details=details,
            reply_title="Error diagnostics:",
            reply_content=err_msg,
            link_url=settings.FRONTEND_URL,
            link_text="View Failure Details in Dashboard",
            banner_text=f"⚠️ SLA1 Resolution Window Breached &bull; Overdue by +{overdue_min} minutes. Resolution required before SLA2.",
            banner_type="warning",
        )

        return await self.send_email(l2_email, subject, html_body, plain_body)

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Critical SLA2 Breach Alert (Mails BOTH L1 and L2)
    # ──────────────────────────────────────────────────────────────────────────
    async def send_critical_sla2_alert(
        self,
        pipeline_name: str,
        run_id: str,
        workspace_id: str,
        failed_at: str,
        sla1_target: str,
        sla2_target: str,
        overdue_min: int,
        both_emails: str,
        err_msg: str,
        pipeline_id: str = "",
        failed_action: Optional[str] = None,
    ) -> bool:
        """
        Dispatches a critical alert to BOTH L1 and L2 leads when the SLA2 resolution threshold is breached.
        """
        first_email = both_emails.replace(";", ",").split(",")[0].strip()
        recipient_name = first_email.split("@")[0] if "@" in first_email else first_email
        subject = f"[CRITICAL ALERT] {pipeline_name} - SLA1 & SLA2 Both Breached (+{overdue_min}m)"
        display_ticket_id = f"#{run_id[:16]}" if len(run_id) > 16 else f"#{run_id}"

        failure_time_ist = format_ist(failed_at)
        sla1_target_ist = format_ist(sla1_target)
        sla2_target_ist = format_ist(sla2_target)

        plain_body = f"""
Hi {recipient_name},

Our support team has flagged a critical pipeline failure: both SLA1 and SLA2 resolution thresholds have been exceeded:

Failure details:
Pipeline Name: {pipeline_name}
Pipeline ID: {pipeline_id or 'N/A'}
Workspace ID: {workspace_id}
Run ID: {display_ticket_id}
Failed Action: {failed_action or pipeline_name}
Failure Time (IST): {failure_time_ist}
SLA1 Milestone (IST): {sla1_target_ist} (Breached)
SLA2 Milestone (IST): {sla2_target_ist} (Breached by +{overdue_min}m)
Action Required: Immediate Joint Remediation by L1 and L2 Leads

Error diagnostics:
{err_msg}

Please click the below link to view more details
{settings.FRONTEND_URL}

If you have any questions or need further assistance, please reach out to our support team at helpdesk.
        """.strip()

        details = [
            ("Pipeline Name", pipeline_name),
            ("Pipeline ID", pipeline_id or "N/A"),
            ("Workspace ID", workspace_id),
            ("Run ID", display_ticket_id),
            ("Failed Action", failed_action or pipeline_name),
            ("Failure Time (IST)", failure_time_ist),
            ("SLA1 Milestone (IST)", f"{sla1_target_ist} (Breached)"),
            ("SLA2 Milestone (IST)", f"{sla2_target_ist} (Breached by +{overdue_min}m)"),
            ("Action Required", "Immediate Joint Remediation by L1 and L2 Leads"),
        ]

        html_body = self._build_email_html(
            recipient_email=both_emails,
            intro_message="Our support team has flagged a critical pipeline failure: both SLA1 and SLA2 resolution thresholds have been exceeded:",
            section_title="Failure details:",
            details=details,
            reply_title="Error diagnostics:",
            reply_content=err_msg,
            link_url=settings.FRONTEND_URL,
            link_text="View Failure Details in Dashboard",
            banner_text=f"🚨 Critical Unresolved &bull; Both SLA1 and SLA2 breached. Overdue by +{overdue_min} minutes past SLA2.",
            banner_type="critical",
        )

        return await self.send_email(both_emails, subject, html_body, plain_body)

    # ──────────────────────────────────────────────────────────────────────────
    # 4. 30-Minute Recurring Reminder Alert (Mails BOTH L1 and L2)
    # ──────────────────────────────────────────────────────────────────────────
    async def send_critical_reminder_alert(
        self,
        pipeline_name: str,
        run_id: str,
        workspace_id: str,
        total_overdue_min: int,
        both_emails: str,
        err_msg: str,
        pipeline_id: str = "",
        failed_at: Optional[str] = None,
        failed_action: Optional[str] = None,
    ) -> bool:
        """
        Dispatches 30-minute recurring reminders to BOTH L1 and L2 leads until the incident is marked RESOLVED.
        """
        first_email = both_emails.replace(";", ",").split(",")[0].strip()
        recipient_name = first_email.split("@")[0] if "@" in first_email else first_email
        subject = f"[REMINDER - CRITICAL] {pipeline_name} - Still Unresolved after {total_overdue_min}m"
        display_ticket_id = f"#{run_id[:16]}" if len(run_id) > 16 else f"#{run_id}"

        failure_time_ist = format_ist(failed_at) if failed_at else "N/A"

        plain_body = f"""
Hi {recipient_name},

This is an automated 30-minute reminder regarding an ongoing critical pipeline failure requiring immediate joint attention:

Failure details:
Pipeline Name: {pipeline_name}
Pipeline ID: {pipeline_id or 'N/A'}
Workspace ID: {workspace_id}
Run ID: {display_ticket_id}
Failed Action: {failed_action or pipeline_name}
Failure Time (IST): {failure_time_ist}
Elapsed Time: +{total_overdue_min} minutes since failure
Status: Still Unresolved (Active SLA Breach)
Action Required: Continuous Joint Remediation by L1 and L2 Leads until marked Resolved

Error diagnostics:
{err_msg}

Please click the below link to view more details
{settings.FRONTEND_URL}

If you have any questions or need further assistance, please reach out to our support team at helpdesk.
        """.strip()

        details = [
            ("Pipeline Name", pipeline_name),
            ("Pipeline ID", pipeline_id or "N/A"),
            ("Workspace ID", workspace_id),
            ("Run ID", display_ticket_id),
            ("Failed Action", failed_action or pipeline_name),
            ("Failure Time (IST)", failure_time_ist),
            ("Elapsed Time", f"+{total_overdue_min} minutes since failure"),
            ("Status", "Still Unresolved (Active SLA Breach)"),
            ("Action Required", "Continuous Joint Remediation by L1 and L2 Leads until marked Resolved"),
        ]

        html_body = self._build_email_html(
            recipient_email=both_emails,
            intro_message="This is an automated 30-minute reminder regarding an ongoing critical pipeline failure requiring immediate joint attention:",
            section_title="Failure details:",
            details=details,
            reply_title="Error diagnostics:",
            reply_content=err_msg,
            link_url=settings.FRONTEND_URL,
            link_text="View Failure Details in Dashboard",
            banner_text=f"🚨 30-Minute Recurring Reminder &bull; Incident remains active for +{total_overdue_min} minutes.",
            banner_type="critical",
        )

        return await self.send_email(both_emails, subject, html_body, plain_body)


alert_service = AlertService()
