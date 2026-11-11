import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import './index.css'
import App from './App.jsx'
import { msalInstance } from './config/msalInstance'
import { AuthProvider, AuthGate } from './features/auth'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught UI error in React:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#faf9f8] text-[#242424] flex items-center justify-center p-6 select-none">
          <div className="max-w-md w-full bg-[#ffffff] border border-[#edebe9] rounded shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#fde7e9] border border-[#f19999] text-[#a80000] mx-auto flex items-center justify-center text-xl font-bold">
              !
            </div>
            <h2 className="text-base font-semibold text-[#242424]">Something went wrong</h2>
            <p className="text-xs text-[#a80000] font-mono break-words bg-[#fdf2f2] p-3 rounded border border-[#fecaca] text-left">
              {this.state.error?.message || "An unexpected rendering error occurred."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 px-4 rounded bg-[#0f6cbd] hover:bg-[#115ea3] text-white text-xs font-medium transition shadow-sm"
            >
              Reload Monitoring Hub
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppTree() {
  return (
    <MsalProvider instance={msalInstance}>
      <AuthProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </AuthProvider>
    </MsalProvider>
  );
}

async function bootstrap() {
  const root = createRoot(document.getElementById('root'));
  try {
    await msalInstance.initialize();

    // 1. Process any in-flight redirect response from Entra ID first
    const redirectResponse = await msalInstance.handleRedirectPromise();
    if (redirectResponse?.account) {
      msalInstance.setActiveAccount(redirectResponse.account);
    } else if (!msalInstance.getActiveAccount()) {
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
      }
    }

    // 2. Clean up lingering MSAL redirect state/code parameters from URL
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('state') || url.searchParams.has('code') || url.searchParams.has('client_info')) {
        url.searchParams.delete('state');
        url.searchParams.delete('code');
        url.searchParams.delete('client_info');
        url.searchParams.delete('session_state');
        const cleanSearch = url.searchParams.toString();
        const cleanPath = url.pathname + (cleanSearch ? `?${cleanSearch}` : '') + url.hash;
        window.history.replaceState({}, document.title, cleanPath);
      }
    } catch (cleanErr) {
      console.warn('URL cleanup skipped:', cleanErr);
    }
  } catch (err) {
    // Non-fatal: render anyway so the login screen / error state can show.
    console.error('MSAL initialization error:', err);
  }
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <AppTree />
      </ErrorBoundary>
    </StrictMode>,
  );
}

bootstrap();

