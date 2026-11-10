"""Microsoft Graph API Directory Service for Entra ID (Azure AD) User Lookup.

Powers the Microsoft Fabric People Picker for selecting L1 and L2 support
personnel on individual pipelines, querying Microsoft Graph API directly
using the designated USERS_AZURE_AD Service Principal.
"""
import logging
import time
import urllib.parse
from typing import Any, Dict, List, Optional
import httpx

from app.core.config import settings

logger = logging.getLogger("fabric_monitor.directory")


def _get_initials(display_name: str, email: str) -> str:
    """Computes a clean 2-letter initials string for persona coins."""
    if display_name:
        parts = [p for p in display_name.strip().split() if p]
        if len(parts) >= 2:
            return (parts[0][0] + parts[-1][0]).upper()
        if len(parts) == 1 and len(parts[0]) >= 2:
            return parts[0][:2].upper()
    if email:
        return email[:2].upper()
    return "US"


class DirectoryService:
    """Service querying Microsoft Graph API directly for Entra ID user directory lookups

    using the designated USERS_AZURE_AD Service Principal credentials.
    """

    def __init__(self):
        """Initialize Microsoft Graph token cache and expiry tracker."""
        self._cached_token: Optional[str] = None
        self._token_expires_at: float = 0

    async def _acquire_graph_token(self) -> Optional[str]:
        """Acquires a Microsoft Graph access token using USERS_AZURE_AD credentials."""
        now = time.time()
        if self._cached_token and now < self._token_expires_at - 60:
            return self._cached_token

        tenant_id = settings.USERS_AZURE_AD_TENANT_ID
        client_id = settings.USERS_AZURE_AD_CLIENT_ID
        client_secret = settings.USERS_AZURE_AD_CLIENT_SECRET

        if not (tenant_id and client_id and client_secret):
            logger.error("Missing USERS_AZURE_AD_TENANT_ID, USERS_AZURE_AD_CLIENT_ID, or USERS_AZURE_AD_CLIENT_SECRET in settings")
            return None

        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.post(
                    token_url,
                    data={
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "grant_type": "client_credentials",
                        "scope": "https://graph.microsoft.com/.default",
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    self._cached_token = data.get("access_token")
                    self._token_expires_at = now + float(data.get("expires_in", 3600))
                    logger.info("Successfully acquired Microsoft Graph API token via USERS_AZURE_AD service principal")
                    return self._cached_token
                else:
                    logger.error(
                        "USERS_AZURE_AD authentication failed (%d): %s",
                        resp.status_code,
                        resp.text,
                    )
            except Exception as exc:
                logger.error("Error acquiring token via USERS_AZURE_AD service principal: %s", exc)

        return None

    async def search_users(self, query: str = "", top: int = 15, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Searches users in Entra ID (Azure AD) directory directly via Microsoft Graph API."""
        count = limit if limit is not None else top
        clean_q = query.strip()
        select_fields = "id,displayName,userPrincipalName,mail,jobTitle,department"

        token = await self._acquire_graph_token()
        if not token:
            logger.error("Cannot search directory users: no valid Graph access token")
            return []

        raw_users: List[Dict[str, Any]] = []

        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "Authorization": f"Bearer {token}",
                "ConsistencyLevel": "eventual",
            }
            try:
                if clean_q:
                    # 1. Advanced Graph $search across displayName, mail, userPrincipalName
                    terms = [t.strip().replace('"', '') for t in clean_q.split() if t.strip()]
                    if terms:
                        clauses = [
                            f'("displayName:{t}" OR "mail:{t}" OR "userPrincipalName:{t}")'
                            for t in terms
                        ]
                        search_expr = " AND ".join(clauses)
                        encoded_search = urllib.parse.quote(search_expr)
                        search_url = (
                            f"https://graph.microsoft.com/v1.0/users?$search={encoded_search}"
                            f"&$select={select_fields}&$top={count}"
                        )
                        resp = await client.get(search_url, headers=headers)
                        if resp.status_code == 200:
                            raw_users = resp.json().get("value", [])
                        elif resp.status_code in (401, 403):
                            logger.warning("Microsoft Graph returned %d: token invalid or lacked permissions", resp.status_code)
                            self._cached_token = None
                        else:
                            # Fallback to startswith filter if $search query syntax returned error
                            safe_q = clean_q.replace("'", "''")
                            filter_expr = (
                                f"startswith(displayName, '{safe_q}') or "
                                f"startswith(mail, '{safe_q}') or "
                                f"startswith(userPrincipalName, '{safe_q}')"
                            )
                            encoded_filter = urllib.parse.quote(filter_expr)
                            filter_url = (
                                f"https://graph.microsoft.com/v1.0/users?$filter={encoded_filter}"
                                f"&$select={select_fields}&$top={count}"
                            )
                            f_resp = await client.get(filter_url, headers=headers)
                            if f_resp.status_code == 200:
                                raw_users = f_resp.json().get("value", [])
                            elif f_resp.status_code in (401, 403):
                                self._cached_token = None
                else:
                    url = f"https://graph.microsoft.com/v1.0/users?$select={select_fields}&$top={count}"
                    resp = await client.get(url, headers=headers)
                    if resp.status_code == 200:
                        raw_users = resp.json().get("value", [])
                    elif resp.status_code in (401, 403):
                        self._cached_token = None

            except Exception as exc:
                logger.error("Error querying Microsoft Graph users: %s", exc)

        # Deduplicate and format Graph user objects
        results = []
        seen_emails = set()
        for u in raw_users:
            display_name = u.get("displayName") or ""
            email = (u.get("mail") or u.get("userPrincipalName") or "").lower()
            upn = u.get("userPrincipalName") or ""
            if not email:
                continue
            if email in seen_emails:
                continue
            seen_emails.add(email)

            results.append({
                "id": u.get("id") or email,
                "displayName": display_name or email,
                "email": email,
                "userPrincipalName": upn or email,
                "jobTitle": u.get("jobTitle") or "",
                "department": u.get("department") or "",
                "initials": _get_initials(display_name, email),
            })

        return results[:count]


directory_service = DirectoryService()
directory_domain_service = directory_service
