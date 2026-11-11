import React from 'react';
import { Search, Loader2, ShieldCheck, Trash2 } from 'lucide-react';

/**
 * Derives persona monogram initials from a user's display name or email.
 *
 * @param {string} name - User's full display name.
 * @param {string} email - User's corporate email.
 * @returns {string} Two-letter uppercase monogram initials.
 */
function getPersonaInitials(name, email) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return 'US';
}

/**
 * Formats an ISO date string into a local readable representation.
 *
 * @param {string} iso - ISO date string.
 * @returns {string} Formatted date string or fallback dash.
 */
function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * UsersTable Component
 * 
 * Renders the configured support team roster table with search filtering,
 * persona monogram initials avatar, role badge / switcher (L1 vs L2), and member removal.
 *
 * @param {Object} props
 * @param {Array<Object>} props.users - List of registered support users.
 * @param {string} props.search - Current search query text.
 * @param {(value: string) => void} props.onSearchChange - Callback when search text changes.
 * @param {boolean} props.isLoading - Whether the roster is actively loading from the API.
 * @param {string|null} props.savingEmail - Email of user currently having role updated.
 * @param {string|null} props.deletingEmail - Email of user currently being deleted.
 * @param {(email: string, roleId: string) => Promise<void>} props.onChangeRole - Callback to update a user's role.
 * @param {(email: string) => Promise<void>} props.onDeleteUser - Callback to delete a user from roster.
 * @returns {JSX.Element}
 */
export default function UsersTable({
  users = [],
  search,
  onSearchChange,
  isLoading,
  savingEmail,
  deletingEmail,
  onChangeRole,
  onDeleteUser,
}) {
  return (
    <div className="bg-white border border-[#edebe9] rounded-lg overflow-hidden shadow-xs space-y-3 p-4">
      {/* Table Header and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold text-[#242424] uppercase tracking-wider">
            Configured Support Team ({users.length})
          </h2>
          <p className="text-[11px] text-[#605e5c]">
            These designated L1 and L2 personnel are available to be assigned to pipelines across all workspaces.
          </p>
        </div>

        {/* Search Filter */}
        <div className="flex items-center gap-2 bg-[#faf9f8] border border-[#d1d1d1] rounded px-2.5 py-1.5 w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#797775] shrink-0" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter team members…"
            className="w-full bg-transparent text-xs text-[#242424] placeholder-[#797775] focus:outline-none"
          />
        </div>
      </div>

      {/* Roster Table */}
      <div className="border border-[#edebe9] rounded overflow-hidden">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-[#faf9f8] text-[#605e5c] text-[11px] font-semibold uppercase tracking-wider border-b border-[#edebe9]">
              <th className="px-4 py-2.5 font-semibold">Support Person</th>
              <th className="px-4 py-2.5 font-semibold">Assigned Role</th>
              <th className="px-4 py-2.5 font-semibold">Change Role</th>
              <th className="px-4 py-2.5 font-semibold">Last Active</th>
              <th className="px-4 py-2.5 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edebe9]">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[#605e5c]">
                  <Loader2 className="w-5 h-5 animate-spin text-[#0f6cbd] inline" />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[#797775]">
                  No personnel configured yet. Use the search box above to add L1 and L2 team members from Microsoft Entra ID.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isAdmin = u.role_id === 'admin';
                const initials = getPersonaInitials(u.display_name, u.email);

                return (
                  <tr key={u.email} className="hover:bg-[#faf9f8] transition">
                    {/* Support Person Monogram & Details */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${
                            isAdmin
                              ? 'bg-[#0f6cbd]'
                              : u.role_id === 'l2'
                              ? 'bg-[#c45500]'
                              : 'bg-[#0078d4]'
                          }`}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-[#242424] truncate">
                            {u.display_name || u.email}
                          </div>
                          <div className="text-[11px] text-[#797775] truncate font-mono">
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Assigned Role Badge */}
                    <td className="px-4 py-2.5">
                      {isAdmin ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold bg-[#eff6fc] text-[#0f6cbd] border-[#0f6cbd]/40">
                          <ShieldCheck className="w-3 h-3" />
                          Administrator (DB Managed)
                        </span>
                      ) : u.role_id === 'l1' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold bg-[#eff6fc] text-[#0f6cbd] border-[#0f6cbd]/30">
                          L1 Support Lead
                        </span>
                      ) : u.role_id === 'l2' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold bg-[#fdf3e7] text-[#c45500] border-[#c45500]/30">
                          L2 Escalation Owner
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-medium bg-[#f3f2f1] text-[#605e5c] border-[#d1d1d1]">
                          None
                        </span>
                      )}
                    </td>

                    {/* Role Switcher Dropdown */}
                    <td className="px-4 py-2.5">
                      {isAdmin ? (
                        <span className="text-[11px] text-[#797775] italic">
                          Managed in database
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={u.role_id || 'l1'}
                            disabled={savingEmail === u.email}
                            onChange={(e) => onChangeRole(u.email, e.target.value)}
                            className="px-2 py-1 rounded border border-[#8a8886] hover:border-[#242424] text-xs bg-white text-[#242424] focus:outline-none focus:ring-1 focus:ring-[#0f6cbd] disabled:opacity-50"
                          >
                            <option value="l1">L1 Support Lead</option>
                            <option value="l2">L2 Escalation Owner</option>
                          </select>
                          {savingEmail === u.email && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0f6cbd]" />
                          )}
                        </div>
                      )}
                    </td>

                    {/* Last Active Timestamp */}
                    <td className="px-4 py-2.5 text-[#605e5c] text-[11px]">
                      {formatWhen(u.last_login_at || u.created_at)}
                    </td>

                    {/* Delete Action */}
                    <td className="px-4 py-2.5 text-right">
                      {!isAdmin && (
                        <button
                          type="button"
                          onClick={() => onDeleteUser(u.email)}
                          disabled={deletingEmail === u.email}
                          title={`Remove ${u.email}`}
                          className="p-1 rounded text-[#797775] hover:text-[#a4262c] hover:bg-[#fdf2f2] transition"
                        >
                          {deletingEmail === u.email ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
