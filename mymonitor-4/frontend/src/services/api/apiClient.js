import { msalInstance } from '../../config/msalInstance';
import { loginRequest, authEnabled } from '../../config/authConfig';

let _tokenRefreshPromise = null;

/**
 * Acquires a fresh Entra ID token for the active account.
 * When forceRefresh is true, bypasses MSAL's local cache and requests a renewed token from Azure AD.
 * Returns null when auth is disabled or no account is signed in.
 *
 * @param {boolean} [forceRefresh=false] - Whether to force a token renewal from Entra ID
 * @returns {Promise<string|null>} The renewed ID token or null
 */
export async function getAccessToken(forceRefresh = false) {
  if (!authEnabled) return null;

  let account = msalInstance.getActiveAccount();
  if (!account) {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      account = accounts[0];
      msalInstance.setActiveAccount(account);
    }
  }
  if (!account) return null;

  if (forceRefresh) {
    if (!_tokenRefreshPromise) {
      _tokenRefreshPromise = (async () => {
        try {
          console.info('[Auth] Forcing silent token renewal from Entra ID...');
          const result = await msalInstance.acquireTokenSilent({
            ...loginRequest,
            account,
            forceRefresh: true,
          });
          console.info('[Auth] Token successfully renewed.');
          return result.idToken;
        } catch (err) {
          console.warn('[Auth] Force silent token renewal failed:', err);
          // If silent renewal requires user interaction, fallback to interactive redirect
          try {
            await msalInstance.acquireTokenRedirect({ ...loginRequest, account });
          } catch (redirectErr) {
            console.error('[Auth] Interactive token acquisition failed:', redirectErr);
          }
          return null;
        } finally {
          _tokenRefreshPromise = null;
        }
      })();
    }
    return await _tokenRefreshPromise;
  }

  try {
    const result = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
    // The backend validates the ID token (aud = SPA client id).
    return result.idToken;
  } catch (err) {
    console.warn('[Auth] Cached token acquisition failed, attempting force refresh:', err);
    return await getAccessToken(true);
  }
}

/**
 * Authenticated fetch wrapper. Attaches the Bearer token, sets JSON headers,
 * automatically detects expired/invalid tokens (HTTP 401), renews them via MSAL,
 * retries the request, and throws clean Error messages on unresolvable failures.
 */
export async function apiFetch(path, options = {}) {
  const token = await getAccessToken(options.forceRefresh || false);
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let res = await fetch(path, { ...options, headers });

  // If HTTP 401 Unauthorized is returned and not already retrying, renew token and retry once
  if (res.status === 401 && !options._isRetry && authEnabled) {
    console.warn(`[apiFetch] HTTP 401 received for ${path}. Renewing token and retrying request...`);
    const freshToken = await getAccessToken(true);
    if (freshToken) {
      headers.Authorization = `Bearer ${freshToken}`;
      res = await fetch(path, { ...options, headers, _isRetry: true });
    }
  }

  if (!res.ok) {
    let detail = '';
    try {
      const cloned = res.clone();
      try {
        const json = await cloned.json();
        detail = json.detail || json.message || JSON.stringify(json);
      } catch {
        detail = await res.text();
      }
    } catch {
      /* ignore */
    }
    const error = new Error(detail || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }

  const contentType = res.headers.get('content-type') || '';
  return contentType.includes('application/json') ? res.json() : res.text();
}
