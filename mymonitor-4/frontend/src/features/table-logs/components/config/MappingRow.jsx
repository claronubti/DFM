import React from 'react';
import { Check } from 'lucide-react';

/**
 * MappingRow renders a single audit attribute mapping row with an interactive column selector.
 *
 * @param {Object} props
 * @param {string} props.label - Target attribute title.
 * @param {string} props.description - Field description or purpose.
 * @param {string} props.currentVal - Current mapped database column name.
 * @param {Array} props.columns - Discovered database columns with name and dataType.
 * @param {Function} props.onChange - Selection change callback.
 */
export default function MappingRow({ 
  label, 
  description, 
  currentVal, 
  columns = [], 
  onChange 
}) {
  return (
    <div className="p-3 rounded-md bg-[#fafafa] border border-[#edebe9] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#117865]/40 transition shadow-2xs">
      <div className="sm:w-1/2">
        <div className="font-semibold text-[#242424] text-xs flex items-center gap-1.5">
          <span>{label}</span>
        </div>
        <p className="text-[11px] text-[#616161] mt-0.5 leading-snug">{description}</p>
      </div>

      <div className="sm:w-1/2 flex items-center gap-2">
        <select
          value={currentVal || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white border border-[#d1d1d1] rounded-md px-2.5 py-1.5 text-xs text-[#242424] font-mono focus:outline-none focus:border-[#117865] cursor-pointer shadow-2xs"
        >
          <option value="">-- Select Column --</option>
          {columns.map(c => (
            <option key={c.name} value={c.name} className="bg-white text-[#242424]">
              {c.name} ({c.dataType})
            </option>
          ))}
        </select>
        {currentVal ? (
          <span className="px-2 py-0.5 rounded bg-[#e3f7ef] border border-[#117865]/30 text-[10px] text-[#117865] font-mono shrink-0 font-semibold flex items-center gap-1">
            <Check className="w-2.5 h-2.5 stroke-[3]" /> Mapped
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded bg-[#f5f5f5] text-[10px] text-[#616161] font-mono shrink-0">
            Unmapped
          </span>
        )}
      </div>
    </div>
  );
}
