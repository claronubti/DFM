/**
 * FabricSuiteBar Component
 * 
 * Microsoft Fabric Native Global Suite Bar (48px):
 * - Microsoft 365 / Fabric App Launcher (9-dot waffle)
 * - Microsoft Fabric branding diamond & workload title
 * - Fluent 2 Global Search experience with keyboard shortcut
 * - Live WebSocket telemetry presence indicator & viewer count
 * - Suite-level Refresh action
 * - Fabric suite utility icons (Notifications, Settings, Help)
 * - Fluent 2 User Persona Coin with role tag and profile flyout
 *
 * @param {Object} props
 * @param {string} [props.currentView='monitoring'] - Current view key.
 * @param {string} [props.currentWorkspaceId] - Active workspace ID.
 * @param {((id: string) => void)|undefined} [props.onSelectWorkspace] - Callback to switch workspace.
 * @param {boolean} props.isConnected - Live WebSocket connection status.
 * @param {number} [props.viewersCount] - Real-time active viewers on workspace telemetry.
 * @param {string|Date} [props.lastUpdated] - Last data sync timestamp.
 * @param {() => void} [props.onRefresh] - Global refresh trigger callback.
 * @param {boolean} [props.isLoading=false] - Refresh loading status.
 * @param {Object|null} [props.user=null] - Logged in user profile.
 * @param {string} [props.role='none'] - Logged in user role.
 * @param {boolean} [props.isAdmin=false] - Whether user has admin rights.
 * @param {() => void} [props.onOpenAdmin] - Callback to open admin view.
 * @param {() => void} [props.onSignOut] - Callback to sign out.
 * @returns {JSX.Element}
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  WifiOff,
  RefreshCw,
  Search,
  ShieldCheck,
  LogOut,
  Bell,
  Settings,
  HelpCircle,
  X,
  User
} from 'lucide-react';
import FabricGlobalSearch from './FabricGlobalSearch';
import { TourHelpMenu, useTour } from '../../features/tour';

const ROLE_LABELS = {
  admin: 'Admin',
  l1: 'L1 Support',
  l2: 'L2 Support',
  none: 'No access'
};

function initialsFor(user) {
  const source = user?.name || user?.email || 'User';
  const parts = source.replace(/@.*/, '').split(/[.\s_-]+/).filter(Boolean);
  const letters = (parts[0]?.[0] || 'U') + (parts[1]?.[0] || '');
  return letters.toUpperCase();
}

export default function FabricSuiteBar({
  currentView = 'monitoring',
  onSelectView,
  pipelines = [],
  onSelectPipeline,
  onStartTour,
  currentWorkspaceId,
  onSelectWorkspace,
  isConnected,
  viewersCount,
  lastUpdated,
  onRefresh,
  isLoading,
  onOpenTableLogConfig,
  user = null,
  role = 'none',
  isAdmin = false,
  onOpenAdmin,
  onSignOut
}) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const profileRef = useRef(null);
  const searchInputRef = useRef(null);

  let tourApi = null;
  try {
    tourApi = useTour();
  } catch { }
  const handleStartTour = onStartTour || (() => tourApi?.startTour());

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global keyboard shortcut to focus search: Ctrl+/
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const workloadTitle =
    currentView === 'table-logs' ? 'Table logs' :
      currentView === 'table-log-config' ? 'Table log configuration' :
        currentView === 'admin' ? 'Admin console' :
          'Monitoring hub';

  return (
    <header className="h-12 bg-[#ffffff] border-b border-[#edebe9] text-[#242424] flex items-center justify-between px-3 sticky top-0 z-40 select-none shadow-[0_1px_2px_rgba(0,0,0,0.03)] font-sans">
      {/* Left: Microsoft 365 Waffle + Microsoft Fabric Workload Branding */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Microsoft 365 Waffle App Launcher */}
        <button
          type="button"
          data-tour="app-launcher"
          title="App launcher"
          aria-label="App launcher"
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f3f2f1] active:bg-[#edebe9] text-[#605e5c] hover:text-[#242424] transition"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="1" width="3" height="3" rx="0.5" />
            <rect x="6.5" y="1" width="3" height="3" rx="0.5" />
            <rect x="12" y="1" width="3" height="3" rx="0.5" />
            <rect x="1" y="6.5" width="3" height="3" rx="0.5" />
            <rect x="6.5" y="6.5" width="3" height="3" rx="0.5" />
            <rect x="12" y="6.5" width="3" height="3" rx="0.5" />
            <rect x="1" y="12" width="3" height="3" rx="0.5" />
            <rect x="6.5" y="12" width="3" height="3" rx="0.5" />
            <rect x="12" y="12" width="3" height="3" rx="0.5" />
          </svg>
        </button>

        {/* Microsoft Fabric Diamond & Brand Text */}
        <div className="flex items-center gap-2 pl-0.5">
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="fabric_grad_v2" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#1177D7" />
                <stop offset="50%" stopColor="#00A2ED" />
                <stop offset="100%" stopColor="#00B7C3" />
              </linearGradient>
              <linearGradient id="fabric_grad_overlay" x1="16" y1="4" x2="16" y2="28" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.08" />
              </linearGradient>
            </defs>
            <path d="M16 2.5 L29.5 16 L16 29.5 L2.5 16 Z" fill="url(#fabric_grad_v2)" />
            <path d="M16 6.5 L25.5 16 L16 25.5 L6.5 16 Z" fill="url(#fabric_grad_overlay)" />
          </svg>

          <span className="text-[13px] font-semibold text-[#242424] tracking-tight">
            Microsoft Fabric
          </span>
          <span className="text-[#d1d1d1] font-light text-xs hidden sm:inline">|</span>
          <span className="text-xs text-[#605e5c] font-normal hidden sm:inline truncate max-w-[160px] md:max-w-none">
            {workloadTitle}
          </span>
        </div>
      </div>

      {/* Center: Microsoft Fluent 2 Global Search */}
      <div className="hidden md:flex items-center justify-center flex-1 max-w-md lg:max-w-lg mx-4" data-tour="global-search">
        <FabricGlobalSearch
          currentView={currentView}
          onSelectView={onSelectView}
          pipelines={pipelines}
          onSelectPipeline={onSelectPipeline}
          onStartTour={handleStartTour}
          onRefresh={onRefresh}
        />
      </div>

      {/* Right: Live Sync Badge + Refresh + Utilities + User Persona */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Live WebSocket Telemetry Presence Indicator */}
        {currentWorkspaceId && (
          <div
            data-tour="live-sync-indicator"
            title={isConnected ? `Live Fabric Telemetry connected • ${viewersCount} active viewer(s)` : "Reconnecting to live telemetry..."}
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border transition ${isConnected
              ? 'bg-[#dff6dd] text-[#107c41] border-[#107c41]/25'
              : 'bg-[#fde7e9] text-[#a4262c] border-[#a4262c]/25'
              }`}
          >
            {isConnected ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#107c41] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#107c41]"></span>
                </span>
                <span className="font-semibold">Live</span>
                {viewersCount > 0 && (
                  <span className="text-[#605e5c] text-[10px] font-mono">
                    ({viewersCount})
                  </span>
                )}
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-[#a4262c]" />
                <span>Offline</span>
              </>
            )}
          </div>
        )}

        {/* Global Refresh Button */}
        <button
          onClick={onRefresh}
          data-tour="refresh-button"
          title={lastUpdated ? `Sync with Fabric • Last synced: ${new Date(lastUpdated).toLocaleTimeString()}` : "Manual Fabric Poll Sync"}
          className="h-8 px-2 rounded hover:bg-[#f3f2f1] active:bg-[#edebe9] text-[#605e5c] hover:text-[#242424] transition flex items-center justify-center gap-1 text-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-[#0f6cbd]" : ""}`} />
          <span className="hidden xl:inline text-xs font-normal">Refresh</span>
        </button>

        {/* Microsoft Fabric Utility Icons (Notifications, Settings, Help) */}
        <button
          type="button"
          title="Notifications"
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f3f2f1] text-[#605e5c] hover:text-[#242424] transition"
        >
          <Bell className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={isAdmin && onOpenAdmin ? onOpenAdmin : undefined}
          title={isAdmin ? "Admin Settings" : "Settings"}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f3f2f1] text-[#605e5c] hover:text-[#242424] transition"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Tour & Help Onboarding Hub */}
        <TourHelpMenu
          onStartTour={handleStartTour}
        />

        <div className="h-5 w-[1px] bg-[#edebe9] mx-1"></div>

        {/* Fluent Persona Coin & Profile Flyout */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            title={user?.email ? `Signed in as ${user.email}` : 'Signed in'}
            className="flex items-center gap-1.5 p-0.5 rounded-full hover:ring-2 hover:ring-[#0f6cbd]/40 transition focus:outline-none"
          >
            {/* Persona Coin */}
            <div className="w-7 h-7 rounded-full bg-[#0f6cbd] text-white flex items-center justify-center text-xs font-semibold shadow-xs select-none relative">
              {initialsFor(user)}
              {/* Online Presence Indicator */}
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[#107c41] ring-1 ring-white" />
            </div>
          </button>

          {/* Profile Dropdown Card */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-md bg-[#ffffff] border border-[#edebe9] shadow-xl z-50 overflow-hidden font-sans animate-in fade-in duration-100">
              <div className="p-3 border-b border-[#edebe9] bg-[#faf9f8]">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-[#0f6cbd] text-white flex items-center justify-center text-sm font-semibold shadow-xs">
                    {initialsFor(user)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#242424] truncate">
                      {user?.name || user?.email || 'Authenticated User'}
                    </div>
                    <div className="text-[11px] text-[#605e5c] truncate">
                      {user?.email || ''}
                    </div>
                    <div className="mt-1">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#eff6fc] text-[#0f6cbd] border border-[#0f6cbd]/25">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        {ROLE_LABELS[role] || 'User'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="p-1 space-y-0.5">
                {isAdmin && onOpenAdmin && (
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      onOpenAdmin();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#242424] hover:bg-[#f3f2f1] rounded transition text-left"
                  >
                    <Settings className="w-3.5 h-3.5 text-[#605e5c]" />
                    <span>Open Admin Console</span>
                  </button>
                )}

                {onSignOut && (
                  <button
                    onClick={() => {
                      setIsProfileOpen(false);
                      onSignOut();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#c42b1c] hover:bg-[#fde7e9] rounded transition text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign out</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
