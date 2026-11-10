/**
 * FabricMetricCards Component
 * 
 * Microsoft Fabric Native Monitoring KPI Metric Strip:
 * - Clean, unified Fluent 2 KPI tiles
 * - Executive layer overview (Total, In Progress, Completed, Failed, SLA Breached)
 * - Microsoft Fabric Proportional Health Distribution Bar (3px multi-segment bar)
 * - Microsoft Fluent Typography (Segoe UI Variable numerals)
 * - Interactive filter triggers with subtle brand selection states
 *
 * @param {Object} props
 * @param {Object} props.metrics - Counts per status.
 * @param {string} props.statusFilter - Active status filter key.
 * @param {(filterId: string) => void} props.onStatusFilterChange - Status filter callback.
 * @param {boolean} [props.isFuture=false] - Whether forecast view is active.
 * @param {boolean} [props.isLoading=false] - Loading shimmer flag.
 * @returns {JSX.Element}
 */

import React from 'react';
import {
  Layers,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  CalendarClock,
  CalendarX,
  Loader2,
  ShieldAlert
} from 'lucide-react';

export default function FabricMetricCards({
  metrics = {},
  statusFilter = 'ALL',
  onStatusFilterChange,
  isFuture = false,
  isLoading = false
}) {
  const total = metrics.total ?? 0;

  if (isFuture) {
    const futureCards = [
      { id: 'ALL', label: 'Total pipelines', count: total, icon: Layers, color: 'neutral' },
      { id: 'SCHEDULED', label: 'Scheduled to run', count: metrics.scheduled ?? 0, icon: CalendarClock, color: 'purple' },
      { id: 'NOT_SCHEDULED', label: 'Not scheduled', count: metrics.notScheduled ?? 0, icon: CalendarX, color: 'neutral' }
    ];

    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 select-none font-sans">
        {futureCards.map((card) => {
          const isActive = statusFilter === card.id;
          const Icon = card.icon;

          return (
            <button
              key={card.id}
              onClick={() => onStatusFilterChange(card.id)}
              className={`p-3 rounded-md border text-left transition flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${isActive
                  ? 'bg-[#faf5ff] border-[#773adc] ring-1 ring-[#773adc]'
                  : 'bg-[#ffffff] border-[#edebe9] hover:bg-[#faf9f8] hover:border-[#d1d1d1]'
                }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${card.color === 'purple' ? 'bg-[#f3e8ff] text-[#773adc]' : 'bg-[#f3f2f1] text-[#605e5c]'
                  }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-[#605e5c] font-medium">
                    {card.label}
                  </div>
                  <div className="text-lg font-bold font-mono text-[#242424] tracking-tight mt-0.5">
                    {isLoading ? (
                      <div className="h-5 w-8 bg-[#edebe9] rounded animate-pulse" />
                    ) : (
                      card.count
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  const cards = [
    { id: 'ALL', label: 'Total', count: total, icon: Layers, color: 'neutral' },
    { id: 'RUNNING', label: 'In progress', count: metrics.running ?? 0, icon: Loader2, color: 'blue', isSpin: true },
    { id: 'SUCCEEDED', label: 'Completed', count: metrics.succeeded ?? 0, icon: CheckCircle2, color: 'green' },
    { id: 'FAILED', label: 'Failed', count: metrics.failed ?? 0, icon: XCircle, color: 'red' },
    { id: 'SLA_BREACHED', label: 'SLA breached', count: metrics.slaBreached ?? 0, icon: ShieldAlert, color: 'rose' },
    { id: 'CANCELLED', label: 'Cancelled', count: metrics.cancelled ?? 0, icon: Ban, color: 'neutral' },
    { id: 'NO_RUNS', label: 'Not run', count: metrics.notRun ?? 0, icon: Clock, color: 'neutral' },
    { id: 'SCHEDULED', label: 'Scheduled', count: metrics.scheduled ?? 0, icon: CalendarClock, color: 'purple' },
    { id: 'NOT_SCHEDULED', label: 'Not scheduled', count: metrics.notScheduled ?? 0, icon: CalendarX, color: 'neutral' }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2 select-none font-sans">
      {cards.map((card) => {
        const isActive = statusFilter === card.id;
        const Icon = card.icon;

        let iconColor = 'text-[#605e5c] bg-[#f3f2f1]';
        let activeBorder = 'border-[#0f6cbd] ring-1 ring-[#0f6cbd] bg-[#eff6fc]';

        if (card.color === 'blue') {
          iconColor = 'text-[#0f6cbd] bg-[#eff6fc]';
          activeBorder = 'border-[#0f6cbd] ring-1 ring-[#0f6cbd] bg-[#eff6fc]';
        } else if (card.color === 'green') {
          iconColor = 'text-[#107c41] bg-[#dff6dd]';
          activeBorder = 'border-[#107c41] ring-1 ring-[#107c41] bg-[#f2faf3]';
        } else if (card.color === 'red') {
          iconColor = 'text-[#c42b1c] bg-[#fde7e9]';
          activeBorder = 'border-[#c42b1c] ring-1 ring-[#c42b1c] bg-[#fdf5f5]';
        } else if (card.color === 'rose') {
          iconColor = 'text-[#a80000] bg-[#fde7e9]';
          activeBorder = 'border-[#a80000] ring-1 ring-[#a80000] bg-[#fff5f5]';
        } else if (card.color === 'purple') {
          iconColor = 'text-[#773adc] bg-[#f3e8ff]';
          activeBorder = 'border-[#773adc] ring-1 ring-[#773adc] bg-[#faf5ff]';
        }

        return (
          <button
            key={card.id}
            onClick={() => onStatusFilterChange(card.id)}
            className={`p-2.5 rounded-md border text-left transition flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${isActive
                ? activeBorder
                : 'bg-[#ffffff] border-[#edebe9] hover:bg-[#faf9f8] hover:border-[#d1d1d1]'
              }`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-[#605e5c] font-medium truncate">
                {card.label}
              </div>
              <div className="text-base font-bold font-mono text-[#242424] mt-0.5 tracking-tight">
                {isLoading ? (
                  <div className="h-5 w-8 bg-[#edebe9] rounded animate-pulse" />
                ) : (
                  card.count
                )}
              </div>
            </div>

            <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ml-1.5 ${iconColor}`}>
              <Icon className={`w-3.5 h-3.5 ${card.isSpin && card.count > 0 ? "animate-spin" : ""}`} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
