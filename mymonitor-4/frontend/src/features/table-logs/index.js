/**
 * Table Logs Feature Module
 * 
 * Re-exports components, custom hooks, and API endpoints for Fabric Lakehouse / Warehouse table logging.
 * - Config: Wizard & modal to connect Fabric artifacts and map audit columns.
 * - Dashboard: Ingestion telemetry, KPI metrics, layer breakdown, and AI failure diagnostics.
 */

// Dashboard Views
export { default as TableLogsPage } from './components/dashboard/TableLogsPage';
export { default as TableLogDashboardModal } from './components/dashboard/TableLogDashboardModal';

// Configuration Views
export { default as TableLogConfigPage } from './components/config/TableLogConfigPage';
export { default as TableLogConfigModal } from './components/config/TableLogConfigModal';

export * from './hooks';
export * from './api';
