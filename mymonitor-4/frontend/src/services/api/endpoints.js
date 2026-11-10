export const ENDPOINTS = {
  WORKSPACES: '/api/workspaces',
  PIPELINES: (wsId, parentOnly = true) => `/api/workspaces/${wsId}/pipelines${parentOnly ? '?parent_only=true' : '?parent_only=false'}`,
  PARENT_PIPELINES: (wsId, forceSync = false) => `/api/workspaces/${wsId}/parent-pipelines${forceSync ? '?force_sync=true' : ''}`,
  WORKSPACE_TREE: (wsId) => `/api/workspaces/${wsId}/tree`,
  SCHEDULES: (wsId, pipeId) => `/api/workspaces/${wsId}/pipelines/${pipeId}/schedules`,
  HISTORY: (wsId, pipeId) => `/api/workspaces/${wsId}/pipelines/${pipeId}/history`,
  SLA_CONFIG: (wsId, pipeId) => `/api/workspaces/${wsId}/pipelines/${pipeId}/sla`,
  INCIDENTS: '/api/workspaces/incidents',
  RESOLVE_INCIDENT: (id) => `/api/workspaces/incidents/${id}/resolve`,
  AI_FIX: '/api/diagnostics/ai-fix',
  ADMIN_USERS: '/api/admin/users',
  ADMIN_ASSIGNMENTS: '/api/admin/assignments',
};
