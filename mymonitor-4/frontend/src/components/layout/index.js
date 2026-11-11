/**
 * Layout Components Module
 * 
 * Re-exports application layout and frame components:
 * - App Layouts: DashboardLayout, AuthLayout.
 * - Shell Chrome: FabricSuiteBar, FabricNavRail.
 * - Side Panes: FabricDetailSidePane (with SidePaneOverviewTab and SidePaneDiagnosticsTab under ./side-pane).
 */

// App Layout Wrappers
export { default as DashboardLayout } from './DashboardLayout';
export { default as AuthLayout } from './AuthLayout';

// Shell Chrome
export { default as FabricSuiteBar } from './FabricSuiteBar';
export { default as FabricNavRail } from './FabricNavRail';

// Side Overlays
export { default as FabricDetailSidePane } from './FabricDetailSidePane';
export { default as SidePaneOverviewTab } from './side-pane/SidePaneOverviewTab';
export { default as SidePaneDiagnosticsTab } from './side-pane/SidePaneDiagnosticsTab';

