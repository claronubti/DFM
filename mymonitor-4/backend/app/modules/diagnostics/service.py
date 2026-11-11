import re
import json
import hashlib
import logging
from typing import Dict, Any, Optional
import httpx

from app.core.config import settings
from app.modules.diagnostics.repository import diagnostic_repository

logger = logging.getLogger("fabric_monitor.ai_diagnostic")


class AiDiagnosticService:
    """Service leveraging Azure OpenAI GPT-4o for intelligent pipeline error triage and remediation."""

    def __init__(self):
        """Initializes the AI diagnostic service with Azure OpenAI settings."""
        self.endpoint = (settings.AZURE_OPENAI_ENDPOINT or "").rstrip("/")
        self.deployment = settings.AZURE_OPENAI_DEPLOYMENT or "gpt-4o"
        self.api_key = settings.AZURE_OPENAI_API_KEY
        self.api_version = settings.AZURE_OPENAI_API_VERSION or "2024-02-15-preview"

    def _sanitize_error_text(self, text: str) -> str:
        """Removes passwords, secrets, connection strings, and tokens from error messages."""
        if not text:
            return ""
        s = str(text)
        # Redact password, pwd, secret parameters
        s = re.sub(r'(?i)(password|pwd|client_secret|secret|access_token|authorization|bearer)\s*[:=]\s*([^\s;,]+)', r'\1=[REDACTED]', s)
        # Redact JWT tokens
        s = re.sub(r'eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}', '[REDACTED_JWT]', s)
        # Redact account keys or long hex/base64 strings
        s = re.sub(r'(?i)(AccountKey|SharedAccessKey)=([^\s;]+)', r'\1=[REDACTED]', s)
        return s

    def _compute_hash(self, error_code: str, error_message: str, activity_type: str) -> str:
        """Computes deterministic hash for error fingerprinting."""
        raw = f"{str(error_code).strip().lower()}:{str(error_message).strip()[:300].lower()}:{str(activity_type).strip().lower()}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    async def diagnose_failure(
        self,
        pipeline_name: str,
        activity_name: str,
        activity_type: str,
        error_code: str,
        error_message: str,
        failure_type: str = "UserError",
        target: str = "",
        raw_error: Optional[Any] = None,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Diagnoses a pipeline or activity failure using Azure OpenAI GPT-4o.
        Returns root cause, likely causes, step-by-step fix instructions, copyable script, and prevention tips.
        Results are cached in SQLite by error signature.
        """
        sanitized_msg = self._sanitize_error_text(error_message)
        sanitized_code = self._sanitize_error_text(error_code or "N/A")
        sanitized_raw = self._sanitize_error_text(json.dumps(raw_error) if raw_error else "")

        error_hash = self._compute_hash(sanitized_code, sanitized_msg, activity_type)

        # Check cache if not forcing refresh
        if not force_refresh:
            cached = await diagnostic_repository.get_cached_ai_diagnosis(error_hash)
            if cached:
                logger.info(f"Returning cached AI diagnosis for hash {error_hash[:10]}")
                return cached

        if not self.api_key or not self.endpoint:
            return {
                "success": False,
                "error": "Azure OpenAI API key or endpoint is not configured in .env. Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT to enable AI troubleshooting.",
                "rootCause": "AI Diagnostic service is unavailable because AZURE_OPENAI_API_KEY is missing.",
                "severity": "Medium",
                "likelyCauses": ["AZURE_OPENAI_API_KEY is not set in .env"],
                "fixSteps": ["Add AZURE_OPENAI_API_KEY to .env and restart the server."],
                "fixScript": "",
                "fixScriptLanguage": "",
                "preventionTip": "Ensure environment variables are configured in production."
            }

        system_instruction = (
            "You are a Principal Microsoft Fabric & Azure Data Factory Solutions Architect and DataOps Troubleshooting Specialist.\n"
            "Analyze the following data pipeline / activity failure.\n"
            "Identify the exact root cause in plain English, explain why it happened, and provide a clear, numbered checklist of steps to fix it in Fabric / SQL.\n"
            "If a SQL command, PySpark script, or schema alteration fixes the issue, provide the exact copy-pasteable script.\n"
            "You MUST respond ONLY with a JSON object matching this exact schema:\n"
            "{\n"
            '  "rootCause": "Clear, concise 1-2 sentence explanation of what failed and why.",\n'
            '  "severity": "Critical" | "High" | "Medium" | "Low",\n'
            '  "likelyCauses": ["Cause 1", "Cause 2", "Cause 3"],\n'
            '  "fixSteps": ["Step 1: Actionable instruction", "Step 2: Next action", "Step 3: Verification"],\n'
            '  "fixScript": "Copyable SQL script, PySpark snippet, or CLI command if applicable, otherwise empty string",\n'
            '  "fixScriptLanguage": "sql" | "python" | "json" | "bash" | "",\n'
            '  "preventionTip": "Practical advice to prevent this failure in future runs."\n'
            "}"
        )

        user_content = f"""
Failed Pipeline: {pipeline_name}
Failed Activity: {activity_name}
Activity Type: {activity_type}
Failure Type: {failure_type}
Target Object: {target or activity_name}
Error Code: {sanitized_code}
Error Message:
{sanitized_msg}

Raw Diagnostic Details:
{sanitized_raw[:1500]}
"""

        azure_url = f"{self.endpoint}/openai/deployments/{self.deployment}/chat/completions?api-version={self.api_version}"
        headers = {
            "api-key": self.api_key,
            "Content-Type": "application/json"
        }
        payload = {
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_content}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
            "max_tokens": 2048
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(azure_url, headers=headers, json=payload)
                if res.status_code != 200:
                    logger.error(f"Azure OpenAI API returned status {res.status_code}: {res.text}")
                    return {
                        "success": False,
                        "error": f"Azure OpenAI API error ({res.status_code}): {res.text[:200]}",
                        "rootCause": f"Error communicating with Azure OpenAI service (HTTP {res.status_code}).",
                        "severity": "Medium",
                        "likelyCauses": ["Azure OpenAI quota exceeded, invalid deployment, or network issue"],
                        "fixSteps": ["Check Azure OpenAI resource quota and deployment name."],
                        "fixScript": "",
                        "fixScriptLanguage": "",
                        "preventionTip": "Verify API key status and network connectivity."
                    }

                res_json = res.json()
                choices = res_json.get("choices", [])
                if not choices:
                    return {
                        "success": False,
                        "error": "No response choices returned by Azure OpenAI model.",
                        "rootCause": "The AI model did not generate a response for this error payload.",
                        "severity": "Medium",
                        "likelyCauses": ["Content safety filter or empty prompt"],
                        "fixSteps": ["Review the error payload and retry."],
                        "fixScript": "",
                        "fixScriptLanguage": "",
                        "preventionTip": "Ensure error details are well formed."
                    }

                raw_text = choices[0].get("message", {}).get("content", "")
                diag_data = json.loads(raw_text)

                result = {
                    "success": True,
                    "cached": False,
                    "pipelineName": pipeline_name,
                    "activityName": activity_name,
                    "activityType": activity_type,
                    "errorCode": sanitized_code,
                    "rootCause": diag_data.get("rootCause", "An unexpected failure occurred."),
                    "severity": diag_data.get("severity", "High"),
                    "likelyCauses": diag_data.get("likelyCauses", []),
                    "fixSteps": diag_data.get("fixSteps", []),
                    "fixScript": diag_data.get("fixScript", ""),
                    "fixScriptLanguage": diag_data.get("fixScriptLanguage", ""),
                    "preventionTip": diag_data.get("preventionTip", "")
                }

                # Save into SQLite cache
                await diagnostic_repository.save_ai_diagnosis(
                    error_hash=error_hash,
                    error_code=sanitized_code,
                    error_message=sanitized_msg,
                    activity_type=activity_type,
                    pipeline_name=pipeline_name,
                    diagnosis=result
                )

                return result

        except json.JSONDecodeError as jde:
            logger.error(f"Failed to parse Gemini JSON output: {jde}, Raw text: {raw_text}")
            return {
                "success": True,
                "cached": False,
                "pipelineName": pipeline_name,
                "activityName": activity_name,
                "activityType": activity_type,
                "errorCode": sanitized_code,
                "rootCause": raw_text[:300] if 'raw_text' in locals() else "Activity failed during execution.",
                "severity": "High",
                "likelyCauses": ["Malformed AI output"],
                "fixSteps": ["Check activity logs and parameters."],
                "fixScript": "",
                "fixScriptLanguage": "",
                "preventionTip": ""
            }
        except Exception as e:
            logger.exception(f"Error calling AI diagnostic service: {e}")
            return {
                "success": False,
                "error": str(e),
                "rootCause": f"Internal exception while generating AI diagnosis: {str(e)}",
                "severity": "High",
                "likelyCauses": ["Connection timeout or unexpected error"],
                "fixSteps": ["Check server logs and retry diagnosis."],
                "fixScript": "",
                "fixScriptLanguage": "",
                "preventionTip": ""
            }


class DiagnosticsService:
    """High-level service interface for generating AI diagnostic reports."""

    def __init__(self):
        """Initializes the diagnostics facade service with AI failure analyzer."""
        self.ai = AiDiagnosticService()

    async def diagnose(self, payload: Any) -> Dict[str, Any]:
        """Diagnose a pipeline activity error using Gemini AI and return actionable remediation instructions."""
        return await self.ai.diagnose_failure(
            pipeline_name=getattr(payload, "pipelineName", None) or "Pipeline",
            activity_name=getattr(payload, "activityName", None) or "Activity",
            activity_type=getattr(payload, "activityType", None) or "Execution",
            error_code=getattr(payload, "errorCode", None) or "N/A",
            error_message=getattr(payload, "errorMessage", ""),
            failure_type=getattr(payload, "failureType", None) or "UserError",
            target=getattr(payload, "target", "") or "",
            raw_error=getattr(payload, "rawError", None),
            force_refresh=getattr(payload, "forceRefresh", False) or False,
        )


ai_diagnostic_service = AiDiagnosticService()
diagnostics_service = DiagnosticsService()
