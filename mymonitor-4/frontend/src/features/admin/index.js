/**
 * Admin Feature Module
 * 
 * Re-exports components, custom hooks, and API endpoints for administration:
 * - AdminConsole: Master administration pivot interface.
 * - Users Management: UsersPage, AddUserCard, UsersTable.
 * - Pipeline Teams & SLA: PipelineTeamsPage, PipelineTeamsFilterBar, PipelineTeamsTable.
 */

// Master Console
export { default as AdminConsole } from './components/AdminConsole';

// Support Personnel & Users
export { default as UsersPage } from './components/users/UsersPage';
export { default as AddUserCard } from './components/users/AddUserCard';
export { default as UsersTable } from './components/users/UsersTable';

// Pipeline Teams & SLA
export { default as PipelineTeamsPage } from './components/pipeline-teams/PipelineTeamsPage';
export { default as PipelineTeamsFilterBar } from './components/pipeline-teams/PipelineTeamsFilterBar';
export { default as PipelineTeamsTable } from './components/pipeline-teams/PipelineTeamsTable';

export * from './hooks';
export * from './api';

