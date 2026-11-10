/**
 * Enterprise Application Walkthrough Configuration
 * 
 * Single continuous tour of the entire application.
 * Formatted as a single unified 4 to 5 lines description per tour step.
 * 
 * Spans Setup, Configuration, Deployment, Monitoring, Reporting, Administration, and Troubleshooting.
 */

export const TOUR_STEPS = [
  // -------------------------------------------------------------
  // MODULE 1: SETUP
  // -------------------------------------------------------------
  {
    id: 'setup-app-launcher',
    featureName: 'App Launcher & Fabric Suite Bar',
    category: 'Setup',
    view: 'monitoring',
    targetSelector: '[data-tour="app-launcher"], header',
    placement: 'bottom',
    description: 'The unified Microsoft 365 and Fabric navigation header connecting all your cloud data services. It provides quick access between productivity apps, analytics workloads, and workspace resources without losing context. Use it anytime you need to switch experiences or manage cloud account settings.'
  },
  {
    id: 'setup-workspace-selector',
    featureName: 'Workspace Selector',
    category: 'Setup',
    view: 'monitoring',
    targetSelector: '[data-tour="workspace-selector"], .workspace-selector, [aria-label*="workspace" i]',
    placement: 'bottom',
    description: 'The primary workspace switcher that isolates environments, pipelines, lakehouses, and analytics assets. It ensures strict security boundaries and organized collaboration between development, staging, and production teams. Use it at the start of your workday to select your target workspace.'
  },
  {
    id: 'setup-nav-rail',
    featureName: 'Navigation Rail',
    category: 'Setup',
    view: 'monitoring',
    targetSelector: '[data-tour="nav-rail"], aside',
    placement: 'right',
    description: 'The left-hand navigation bar providing instant access across your monitoring hub and administration console. It eliminates deep nested menus so operators can switch between operational telemetry and governance in a single click. Use it to navigate smoothly between live operations and admin tools.'
  },

  // -------------------------------------------------------------
  // MODULE 2: CONFIGURATION
  // -------------------------------------------------------------
  {
    id: 'config-schedules',
    featureName: 'Automated Pipeline Schedules',
    category: 'Configuration',
    view: 'monitoring',
    targetSelector: '[data-tour="schedules-button"], [data-tour="date-filter"]',
    placement: 'bottom',
    description: 'An orchestration timetable displaying all automated pipeline runs and cron triggers across the active workspace. It gives full visibility into when batch loads occur, preventing overlapping executions that could overload cluster capacity. Use it to review daily schedules and resolve timing conflicts.'
  },
  {
    id: 'config-sla',
    featureName: 'SLA Duration Thresholds',
    category: 'Configuration',
    view: 'monitoring',
    targetSelector: '[data-tour="pipeline-sla"], th:nth-child(3), [data-tour="pipeline-tree"]',
    placement: 'bottom',
    description: 'An operational rules engine defining maximum expected pipeline execution durations and escalation paths. It warns operators before delayed data delivery impacts executive reporting and downstream business stakeholders. Use it when setting formal runtime targets for mission-critical pipelines.'
  },

  // -------------------------------------------------------------
  // MODULE 3: DEPLOYMENT
  // -------------------------------------------------------------
  {
    id: 'deployment-live-sync',
    featureName: 'Live WebSocket Synchronization',
    category: 'Deployment',
    view: 'monitoring',
    targetSelector: '[data-tour="live-sync-indicator"], header',
    placement: 'bottom',
    description: 'A real-time telemetry indicator confirming active bi-directional WebSocket streaming with Fabric clusters. It guarantees dashboard metrics reflect instant job status transitions without manual page refreshes. Use it to verify live stream connectivity during deployment rollouts and active batches.'
  },
  {
    id: 'deployment-refresh-control',
    featureName: 'Manual Telemetry Sync',
    category: 'Deployment',
    view: 'monitoring',
    targetSelector: '[data-tour="refresh-button"], header',
    placement: 'bottom',
    description: 'An on-demand sync button that immediately queries Microsoft Fabric REST APIs for the latest execution runs. It provides instant verification after triggering unscheduled runs, deploying new code, or making configuration changes. Use it right after deploying or whenever you need an immediate telemetry pull.'
  },

  // -------------------------------------------------------------
  // MODULE 4: MONITORING
  // -------------------------------------------------------------
  {
    id: 'monitoring-kpi-cards',
    featureName: 'Platform Health KPI Cards',
    category: 'Monitoring',
    view: 'monitoring',
    targetSelector: '[data-tour="kpi-cards"]',
    placement: 'bottom',
    description: 'High-level operational summary cards tracking total executions, in-progress jobs, successful runs, and critical failures. They provide an instant snapshot of workspace health at a single glance without sifting through log lines. Use them during shift handovers or for quick daily platform checks.'
  },
  {
    id: 'monitoring-date-filter',
    featureName: 'Date & Time Horizon Filters',
    category: 'Monitoring',
    view: 'monitoring',
    targetSelector: '[data-tour="date-filter"]',
    placement: 'bottom',
    description: 'A quick-selector bar to filter workspace telemetry by Today, Last 7 Days, Last 30 Days, or custom intervals. It isolates active daily batch runs from historical trends to help pinpoint when performance anomalies began. Use it when conducting retrospective audits or comparing weekly run volumes.'
  },
  {
    id: 'monitoring-pipeline-grid',
    featureName: 'Pipeline Execution Grid',
    category: 'Monitoring',
    view: 'monitoring',
    targetSelector: '[data-tour="pipeline-tree"]',
    placement: 'top',
    description: 'The primary hierarchical table showing parent data pipelines, nested activities, execution statuses, and elapsed runtimes. It reveals the internal execution flow of complex pipelines, showing exactly which step succeeded, failed, or is running. Use it for day-to-day workload tracking and spotting slow steps.'
  },
  {
    id: 'monitoring-detail-sidepane',
    featureName: 'Telemetry Detail Side Pane',
    category: 'Monitoring',
    view: 'monitoring',
    targetSelector: '[data-tour="side-pane-trigger"], [data-tour="pipeline-tree"]',
    placement: 'left',
    description: 'A slide-out telemetry inspector displaying comprehensive activity run parameters, duration benchmarks, and error diagnostics. It provides deep operational context beside your pipeline list without forcing you to leave the monitoring hub. Use it when an activity fails or needs parameter validation.'
  },

  // -------------------------------------------------------------
  // MODULE 5: REPORTING
  // -------------------------------------------------------------
  {
    id: 'reporting-run-history',
    featureName: 'Pipeline Run History Visualizer',
    category: 'Reporting',
    view: 'monitoring',
    targetSelector: '[data-tour="run-history-action"], [data-tour="pipeline-tree"]',
    placement: 'left',
    description: 'A historical timeline view charting pipeline executions, durations, and success trends across previous runs. It helps data leaders identify long-term runtime creep, intermittent failures, and cluster resource bottlenecks. Use it during capacity planning retrospectives and cluster tuning.'
  },

  // -------------------------------------------------------------
  // MODULE 6: TROUBLESHOOTING
  // -------------------------------------------------------------
  {
    id: 'troubleshooting-error-modal',
    featureName: 'Error Root-Cause Diagnostics',
    category: 'Troubleshooting',
    view: 'monitoring',
    targetSelector: '[data-tour="error-diagnostics"], [data-tour="pipeline-sla"], [data-tour="kpi-cards"]',
    placement: 'top',
    description: 'An intelligent error inspector that extracts failed activity stack traces, failure codes, and Fabric error messages. It reduces Mean Time to Resolution by translating raw cluster exceptions into actionable troubleshooting steps. Use it immediately when a pipeline fails to identify the root cause.'
  },
  {
    id: 'troubleshooting-resolve-incident',
    featureName: 'Incident Resolution & Acknowledgment',
    category: 'Troubleshooting',
    view: 'monitoring',
    targetSelector: '[data-tour="resolve-incident-btn"], [data-tour="pipeline-sla"], [data-tour="kpi-cards"]',
    placement: 'bottom',
    description: 'An operational sign-off action allowing engineers to mark handled errors with root-cause notes and resolution timestamps. It prevents duplicate troubleshooting efforts, maintains accountability, and resets SLA escalation alert timers. Use it once you have corrected bad data and validated the re-run.'
  },

  // -------------------------------------------------------------
  // MODULE 7: ADMINISTRATION
  // -------------------------------------------------------------
  {
    id: 'admin-access-control',
    featureName: 'Role-Based Access Management',
    category: 'Administration',
    view: 'admin',
    targetSelector: '[data-tour="admin-nav"], [data-tour="nav-rail"]',
    placement: 'right',
    description: 'A centralized governance portal to manage user permissions, security personas, and pipeline visibility assignments. It enforces least-privilege security so team members only see the workspaces and pipelines assigned to them. Use it when onboarding new data engineers or assigning L1/L2 support leads.'
  },
  {
    id: 'admin-system-diagnostics',
    featureName: 'Platform Health & Diagnostic Audit',
    category: 'Administration',
    view: 'admin',
    targetSelector: '[data-tour="admin-health"], [data-tour="admin-nav"]',
    placement: 'top',
    description: 'A real-time health dashboard displaying database latency, memory consumption, and API integration response times. It guarantees platform availability by warning administrators of infrastructure bottlenecks before user disruption occurs. Use it during maintenance windows or system health audits.'
  },

  // -------------------------------------------------------------
  // MODULE 8: HELP & ADOPTION
  // -------------------------------------------------------------
  {
    id: 'help-global-search',
    featureName: 'Global Search Bar',
    category: 'Help',
    view: 'monitoring',
    targetSelector: '[data-tour="global-search"]',
    placement: 'bottom',
    description: 'A unified quick-search bar in the suite bar that indexes workspaces, pipelines, views, and platform actions. It provides direct keyboard-driven navigation across the application without traversing multiple sub-menus. Use it anytime you want to jump directly to a pipeline or setting using Ctrl+/.'
  },
  {
    id: 'help-center-tour',
    featureName: 'Interactive Tour & Help Hub',
    category: 'Help',
    view: 'monitoring',
    targetSelector: '[data-tour="help-menu"]',
    placement: 'bottom',
    description: 'A permanent onboarding and self-service help hub offering instant product tour replays and quick guides. It empowers team members to self-onboard and refresh platform knowledge without scheduling training sessions. Use it anytime you need a quick refresher or are onboarding new colleagues.'
  }
];
