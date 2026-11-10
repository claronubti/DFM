import React, { useEffect, useMemo, useState } from 'react';
import { Users, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { listUsers, setUserRole, addUser, deleteUser } from '../../api/adminApi';
import AddUserCard from './AddUserCard';
import UsersTable from './UsersTable';

/**
 * UsersPage Component
 * 
 * Master administration view for searching Microsoft Entra ID (Azure AD) users
 * via Graph Service Principal, designating them strictly as L1 Support Leads
 * or L2 Escalation Owners, and managing support team rosters.
 *
 * @returns {JSX.Element}
 */
export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  // Add person form state
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [newPersonRole, setNewPersonRole] = useState('l1');
  const [adding, setAdding] = useState(false);
  const [savingEmail, setSavingEmail] = useState(null);
  const [deletingEmail, setDeletingEmail] = useState(null);

  /** Loads all registered users from the backend admin API. */
  const loadUsers = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const data = await listUsers();
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (err) {
      let errMsg = err.message || 'Failed to load users.';
      try {
        const parsed = JSON.parse(errMsg);
        if (parsed.detail) errMsg = parsed.detail;
      } catch {
        /* use raw message */
      }
      setStatus({ type: 'err', msg: errMsg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  /** Adds a selected Entra ID user to the local support team with the chosen role. */
  const handleAddUser = async () => {
    if (!selectedPerson || !selectedPerson.email) {
      setStatus({ type: 'err', msg: 'Please select a person from the directory first.' });
      return;
    }
    setAdding(true);
    setStatus(null);
    try {
      const data = await addUser({
        email: selectedPerson.email,
        display_name: selectedPerson.displayName || selectedPerson.name || '',
        oid: selectedPerson.id || selectedPerson.oid || '',
        role_id: newPersonRole,
      });
      setUsers(Array.isArray(data?.users) ? data.users : []);
      setStatus({
        type: 'ok',
        msg: `Added ${selectedPerson.displayName || selectedPerson.email} as ${
          newPersonRole === 'l1' ? 'L1 Support Lead' : 'L2 Escalation Owner'
        }.`,
      });
      setSelectedPerson(null);
      setNewPersonRole('l1');
    } catch (err) {
      let errMsg = err.message || 'Failed to add user.';
      try {
        const parsed = JSON.parse(errMsg);
        if (parsed.detail) errMsg = parsed.detail;
      } catch {
        /* use raw message */
      }
      setStatus({ type: 'err', msg: errMsg });
    } finally {
      setAdding(false);
    }
  };

  /**
   * Updates an existing support team member's role (l1 or l2).
   *
   * @param {string} email - User's email address.
   * @param {string} roleId - Target role ('l1' or 'l2').
   */
  const handleChangeRole = async (email, roleId) => {
    setSavingEmail(email);
    setStatus(null);
    try {
      const data = await setUserRole(email, roleId);
      setUsers(Array.isArray(data?.users) ? data.users : []);
      setStatus({
        type: 'ok',
        msg: `Updated ${email} → ${roleId === 'l1' ? 'L1 Support Lead' : 'L2 Escalation Owner'}.`,
      });
    } catch (err) {
      setStatus({ type: 'err', msg: err.message || 'Failed to update role.' });
    } finally {
      setSavingEmail(null);
    }
  };

  /**
   * Deletes a non-admin support team member from the roster.
   *
   * @param {string} email - User's email address.
   */
  const handleDeleteUser = async (email) => {
    if (!window.confirm(`Remove ${email} from the support roster?`)) return;
    setDeletingEmail(email);
    setStatus(null);
    try {
      const data = await deleteUser(email);
      setUsers(Array.isArray(data?.users) ? data.users : []);
      setStatus({ type: 'ok', msg: `Removed ${email} from the team.` });
    } catch (err) {
      setStatus({ type: 'err', msg: err.message || 'Failed to delete user.' });
    } finally {
      setDeletingEmail(null);
    }
  };

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
          (u.display_name || '').toLowerCase().includes(search.toLowerCase()),
      ),
    [users, search],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#faf9f8] text-[#242424]">
      {/* Fabric Header */}
      <div className="px-6 py-4 bg-white border-b border-[#edebe9] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-[#eff6fc] text-[#0f6cbd] flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-[#242424]">
              Users &amp; Support Personnel
            </h1>
            <p className="text-xs text-[#605e5c]">
              Select people from Microsoft Entra ID (Azure AD) and designate them strictly as L1 Support Leads or L2 Escalation Owners.
            </p>
          </div>
        </div>
        <button
          onClick={loadUsers}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#d1d1d1] hover:bg-[#f3f2f1] text-xs font-medium text-[#242424] transition shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#0f6cbd]' : 'text-[#605e5c]'}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="p-6 flex-1 overflow-y-auto space-y-5">
        {/* Status notification banner */}
        {status && (
          <div
            className={`flex items-center gap-2 text-xs rounded p-3 border ${
              status.type === 'ok'
                ? 'bg-[#f1faf1] border-[#a7d8a7] text-[#107c10]'
                : 'bg-[#fdf2f2] border-[#fecaca] text-[#a80000]'
            }`}
          >
            {status.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="break-words font-medium">{status.msg}</span>
          </div>
        )}

        {/* 1. Add Support Personnel Card (People Picker from Entra ID) */}
        <AddUserCard
          selectedPerson={selectedPerson}
          onSelectPerson={setSelectedPerson}
          newPersonRole={newPersonRole}
          onChangeRole={setNewPersonRole}
          onAddUser={handleAddUser}
          isAdding={adding}
        />

        {/* 2. Team Roster Table */}
        <UsersTable
          users={filteredUsers}
          search={search}
          onSearchChange={setSearch}
          isLoading={loading}
          savingEmail={savingEmail}
          deletingEmail={deletingEmail}
          onChangeRole={handleChangeRole}
          onDeleteUser={handleDeleteUser}
        />
      </div>
    </div>
  );
}
