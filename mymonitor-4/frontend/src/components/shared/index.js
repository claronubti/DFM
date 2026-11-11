/**
 * Shared Components Module
 * 
 * Re-exports common UI modals, drawers, selectors, and error boundaries:
 * - Selectors & Pickers: WorkspaceSelector, FabricPeoplePicker, DateFilterBar.
 * - Modals & Drawers: RunHistoryModal, PipelineScheduleModal, SchedulesDrawer, SlaConfigModal, ErrorDetailModal.
 * - Reliability: ErrorBoundary.
 * - Sub-rows: HistoryActivityRow, HistorySubPipelineRow, HistoryContainerRow (under ./history).
 */

// Selectors & Filters
export { default as WorkspaceSelector } from './WorkspaceSelector';
export { default as FabricPeoplePicker } from './FabricPeoplePicker';
export { default as DateFilterBar } from './DateFilterBar';

// Modals & Drawers
export { default as RunHistoryModal } from './RunHistoryModal';
export { default as PipelineScheduleModal } from './PipelineScheduleModal';
export { default as SchedulesDrawer } from './SchedulesDrawer';
export { default as SlaConfigModal } from './SlaConfigModal';
export { default as ErrorDetailModal } from './ErrorDetailModal';
export { default as FabricProductTourModal } from './FabricProductTourModal';

// Error Handling
export { default as ErrorBoundary } from './ErrorBoundary';

// History Tree Rows
export { default as HistoryActivityRow } from './history/HistoryActivityRow';
export { default as HistorySubPipelineRow } from './history/HistorySubPipelineRow';
export { default as HistoryContainerRow } from './history/HistoryContainerRow';

