/**
 * DashboardLayout Component
 * 
 * Master layout wrapper for authenticated sessions:
 * - Top header suite bar with branding, user persona, and connection status
 * - Left vertical navigation rail for switching between Monitoring, Table Logs, and Admin
 * - Central view content area
 * - Slide-over FabricDetailSidePane for in-depth execution drilldowns
 *
 * @param {Object} props
 * @param {Object|null} props.profile - Authenticated user profile.
 * @param {string} props.role - Assigned user role ('admin'|'l1'|'l2'|'none').
 * @param {boolean} props.isAdmin - Whether the user has administrator privileges.
 * @param {() => void} props.onLogout - Callback to sign out.
 * @param {string} props.currentView - Active view key ('monitoring'|'table-logs'|'admin').
 * @param {(view: string) => void} props.onViewChange - Callback to change current view.
 * @param {React.ReactNode} props.children - Main view content.
 * @returns {JSX.Element}
 */

import React from 'react';
import FabricSuiteBar from './FabricSuiteBar';
import FabricNavRail from './FabricNavRail';
import FabricDetailSidePane from './FabricDetailSidePane';

export default function DashboardLayout({
  profile,
  role,
  isAdmin,
  onLogout,
  currentView,
  onViewChange,
  workspaces = [],
  selectedWorkspaceId,
  onSelectWorkspace,
  isConnected,
  lastUpdated,
  viewersCount,
  onRefresh,
  selectedSidePaneItem,
  onCloseSidePane,
  onOpenTableLogs,
  onOpenSchedules,
  onOpenHistory,
  onOpenSlaConfig,
  children
}) {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#faf9f8] text-[#242424]">
      {/* Top Suite Bar */}
      <FabricSuiteBar 
        profile={profile} 
        onLogout={onLogout} 
        isAdmin={isAdmin}
        currentView={currentView}
        onViewChange={onViewChange}
      />

      {/* Main Workspace Body */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Left Navigation Rail */}
        <FabricNavRail 
          currentView={currentView} 
          onViewChange={onViewChange} 
          isAdmin={isAdmin}
        />

        {/* View Content Area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {children}
        </main>

        {/* Optional Right Slide-over Side Pane */}
        {selectedSidePaneItem && (
          <FabricDetailSidePane
            item={selectedSidePaneItem}
            onClose={onCloseSidePane}
            onOpenTableLogs={onOpenTableLogs}
            onOpenSchedules={onOpenSchedules}
            onOpenHistory={onOpenHistory}
            onOpenSlaConfig={onOpenSlaConfig}
          />
        )}
      </div>
    </div>
  );
}
