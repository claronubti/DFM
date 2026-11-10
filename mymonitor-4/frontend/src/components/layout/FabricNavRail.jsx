/**
 * FabricNavRail Component
 * 
 * Microsoft Fabric Native Left Navigation Rail:
 * - Fluent 2 icon + label layout
 * - Vertical brand indicator bar on active item (w-[3px] bg-[#0F6CBD])
 * - Fabric Monitoring Hub & Admin Console navigation
 * - Bottom: Active Workspace & Capacity Scope Indicator
 * - Bottom: Official Microsoft Fabric Workload Switcher diamond icon button
 *
 * @param {Object} props
 * @param {string} [props.currentView='monitoring'] - Currently active navigation view.
 * @param {() => void} [props.onNavigateMonitoring] - Callback to switch to monitoring view.
 * @param {boolean} [props.isAdmin=false] - Whether user has admin access.
 * @param {() => void} [props.onNavigateAdmin] - Callback to switch to admin view.
 * @param {string} [props.workspaceName='Current Workspace'] - Active workspace display name.
 * @param {string} [props.userRole='L1'] - User role label.
 * @returns {JSX.Element}
 */

import React from 'react';
import {
  Activity,
  ShieldCheck,
  Box,
  Layers
} from 'lucide-react';

export default function FabricNavRail({
  currentView = 'monitoring',
  onNavigateMonitoring,
  isAdmin = false,
  onNavigateAdmin,
  workspaceName = 'Current Workspace',
  userRole = 'L1'
}) {
  const isMonitoringActive = currentView === 'monitoring' || currentView === 'table-logs';
  const isAdminActive = currentView === 'admin';

  return (
    <aside data-tour="nav-rail" className="w-52 bg-[#f3f2f1] border-r border-[#edebe9] flex flex-col justify-between p-2 shrink-0 z-30 select-none font-sans">
      {/* Top: Workload Navigation Links */}
      <div className="space-y-3">
        {/* Navigation Section Label */}
        <div className="px-2 pt-1 flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#605e5c] uppercase tracking-wider block">
            Workload Views
          </span>
          <span className="text-[10px] text-[#797775] font-mono">
            {userRole}
          </span>
        </div>

        <nav className="space-y-1">
          {/* Monitoring Hub (Pipelines Telemetry) */}
          <button
            type="button"
            onClick={onNavigateMonitoring}
            title="Monitoring hub (Data Pipelines Telemetry)"
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs transition relative group text-left ${isMonitoringActive
                ? "bg-[#ffffff] text-[#0f6cbd] font-semibold shadow-2xs border border-[#edebe9]"
                : "text-[#323130] hover:text-[#242424] hover:bg-[#eae9e8] font-medium"
              }`}
          >
            {/* Fluent 2 Active Item Brand Strip */}
            {isMonitoringActive && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[#0f6cbd]" />
            )}
            <Activity className={`w-4 h-4 shrink-0 ${isMonitoringActive ? "text-[#0f6cbd]" : "text-[#605e5c]"}`} />
            <span className="truncate flex-1">Monitoring hub</span>
            <span className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${isMonitoringActive
                ? "bg-[#eff6fc] text-[#0f6cbd]"
                : "bg-[#e1dfdd] text-[#605e5c]"
              }`}>
              Live
            </span>
          </button>

          {/* Admin Console (Pipeline L1/L2 Teams, Access & Users) */}
          {isAdmin && (
            <button
              type="button"
              data-tour="admin-nav"
              onClick={onNavigateAdmin}
              title="Admin console (Pipeline Teams & User Roles)"
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs transition relative group text-left ${isAdminActive
                  ? "bg-[#ffffff] text-[#0f6cbd] font-semibold shadow-2xs border border-[#edebe9]"
                  : "text-[#323130] hover:text-[#242424] hover:bg-[#eae9e8] font-medium"
                }`}
            >
              {isAdminActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[#0f6cbd]" />
              )}
              <ShieldCheck className={`w-4 h-4 shrink-0 ${isAdminActive ? "text-[#0f6cbd]" : "text-[#605e5c]"}`} />
              <span className="truncate flex-1">Admin console</span>
              <span className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${isAdminActive
                  ? "bg-[#eff6fc] text-[#0f6cbd]"
                  : "bg-[#e1dfdd] text-[#605e5c]"
                }`}>
                Admin
              </span>
            </button>
          )}
        </nav>
      </div>

      {/* Bottom: Active Workspace & Official Microsoft Fabric Workload Switcher */}
      <div className="space-y-2 pt-2 border-t border-[#edebe9]">
        {/* Workspace Card */}
        <div className="p-2 rounded bg-[#ffffff] border border-[#edebe9] shadow-2xs">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-5 h-5 rounded flex items-center justify-center bg-[#eff6fc] text-[#0f6cbd] shrink-0">
              <Box className="w-3 h-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-[#605e5c] font-medium uppercase tracking-wider">
                Workspace
              </div>
              <div className="truncate text-xs font-semibold text-[#242424]" title={workspaceName}>
                {workspaceName}
              </div>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#107c41]"></span>
            <span className="text-[10px] text-[#605e5c] font-mono">Fabric F-SKU</span>
          </div>
        </div>

        {/* Fabric Workload Switcher Button (Signature bottom-left diamond of Microsoft Fabric) */}
        <div className="pt-1 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-[#ffffff] border border-[#edebe9] flex items-center justify-center shadow-2xs">
              <svg className="w-3.5 h-3.5" viewBox="0 0 32 32" fill="none">
                <path d="M16 3 L29 16 L16 29 L3 16 Z" fill="#00A2ED" />
                <path d="M16 7 L25 16 L16 25 L7 16 Z" fill="#1177D7" />
              </svg>
            </div>
            <span className="text-[11px] font-medium text-[#605e5c]">
              Fabric Workload
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
