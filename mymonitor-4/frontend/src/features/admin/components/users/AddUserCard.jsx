import React from 'react';
import { UserPlus, Loader2, Check } from 'lucide-react';
import FabricPeoplePicker from '../../../../components/shared/FabricPeoplePicker';

/**
 * AddUserCard Component
 * 
 * Provides an administrative card interface to search for users in Microsoft Entra ID
 * (Azure AD directory via Microsoft Graph API) and assign them strictly as an L1 Support Lead
 * or L2 Escalation Owner in the local telemetry repository.
 *
 * @param {Object} props
 * @param {Object|null} props.selectedPerson - Currently selected person from directory picker.
 * @param {(person: Object|null) => void} props.onSelectPerson - Callback when person selection changes.
 * @param {string} props.newPersonRole - Selected role identifier ('l1' or 'l2').
 * @param {(role: string) => void} props.onChangeRole - Callback when role selection changes.
 * @param {() => Promise<void>} props.onAddUser - Callback to submit and save the new user.
 * @param {boolean} props.isAdding - Loading indicator while user is being added.
 * @returns {JSX.Element}
 */
export default function AddUserCard({
  selectedPerson,
  onSelectPerson,
  newPersonRole,
  onChangeRole,
  onAddUser,
  isAdding,
}) {
  return (
    <div className="bg-white border border-[#edebe9] rounded-lg p-5 shadow-xs space-y-4">
      {/* Card Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-[#edebe9]">
        <UserPlus className="w-4 h-4 text-[#0f6cbd]" />
        <h2 className="text-xs font-semibold text-[#242424] uppercase tracking-wider">
          Add Support Person from Directory
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        {/* Entra ID Directory Search */}
        <div className="md:col-span-6 space-y-1">
          <label className="text-xs font-medium text-[#323130] flex items-center justify-between">
            <span>Select Person (Entra ID Directory)</span>
            <span className="text-[10px] text-[#797775]">Graph Service Principal</span>
          </label>
          <FabricPeoplePicker
            selectedUser={selectedPerson}
            onSelectUser={(u) => onSelectPerson(u)}
            value={selectedPerson?.email || ''}
            displayName={selectedPerson?.displayName || ''}
            onChange={(u) => onSelectPerson(u)}
            placeholder="Search by name or email in your organization…"
          />
        </div>

        {/* Support Role Selector (Strictly L1 or L2) */}
        <div className="md:col-span-3 space-y-1">
          <label className="text-xs font-medium text-[#323130]">
            Assign Support Role
          </label>
          <select
            value={newPersonRole}
            onChange={(e) => onChangeRole(e.target.value)}
            className="w-full h-8 px-2.5 rounded border border-[#8a8886] hover:border-[#242424] text-xs bg-white text-[#242424] font-medium focus:outline-none focus:ring-1 focus:ring-[#0f6cbd]"
          >
            <option value="l1">L1 Support Lead</option>
            <option value="l2">L2 Escalation Owner</option>
          </select>
        </div>

        {/* Submit Button */}
        <div className="md:col-span-3">
          <button
            type="button"
            onClick={onAddUser}
            disabled={isAdding || !selectedPerson}
            className="w-full h-8 flex items-center justify-center gap-1.5 px-3 rounded bg-[#0f6cbd] hover:bg-[#115ea3] disabled:bg-[#f3f2f1] disabled:text-[#a19f9d] text-white text-xs font-semibold transition shadow-xs focus:outline-none focus:ring-2 focus:ring-[#0f6cbd]"
          >
            {isAdding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>Add to Support Team</span>
          </button>
        </div>
      </div>
    </div>
  );
}
