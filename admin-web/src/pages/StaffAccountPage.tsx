import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ConfirmModal } from '../components/ConfirmModal';
import { StaffAvatar } from '../components/StaffAvatar';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { accountKind, accountKindLabel, loadWorkspaceStaff, type WorkspaceStaff } from '../lib/workspaceStaff';
import { useOnlineUserIds } from '../lib/storePresence';

export function StaffAccountPage() {
  const { user, profile, businessId, refreshProfile, isStoreOwner } = useAuth();
  const onlineIds = useOnlineUserIds();
  const [rows, setRows] = useState<WorkspaceStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<WorkspaceStaff | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await loadWorkspaceStaff(businessId);
    setRows(result.rows);
    setError(result.error ?? result.notice);
    setLoading(false);
  }, [user?.id, businessId]);

  useEffect(() => {
    void load();
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-staff-accounts-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `seller_workspace_owner_id=eq.${businessId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, load]);

  async function setStatus(applicantUserId: string, status: 'approved' | 'rejected') {
    setBusyId(applicantUserId);
    setError(null);
    try {
      const { data, error: uErr } = await supabase.rpc('owner_set_staff_join_status', {
        p_staff_user_id: applicantUserId,
        p_status: status,
      });
      if (uErr) throw uErr;
      const res = data as { ok?: boolean } | null;
      if (res && res.ok === false) throw new Error('Could not update this account.');
      await load();
      void refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemoveStaff() {
    if (!removeTarget) return;
    const staffUserId = removeTarget.user_id;
    setBusyId(staffUserId);
    setError(null);
    try {
      const { data, error: delErr } = await supabase.rpc('owner_delete_staff_account', {
        p_staff_user_id: staffUserId,
      });
      if (delErr) throw delErr;
      const res = data as { ok?: boolean; message?: string; error?: string } | null;
      if (res && res.ok === false) throw new Error(res.message ?? res.error ?? 'Delete failed');
      setRemoveTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  const accounts = useMemo(() => {
    const list = [...rows];
    if (user && isStoreOwner && !list.some((row) => row.user_id === user.id)) {
      list.unshift({
        user_id: user.id,
        display_name: profile?.display_name?.trim() || 'Master admin',
        email: user.email ?? null,
        phone: null,
        seller_join_status: 'approved',
        created_at: '',
        signup_channel: 'admin',
        avatar_path: null,
      });
    }
    const online = new Set(onlineIds);
    return list.sort((a, b) => {
      const aOnline = online.has(a.user_id) ? 1 : 0;
      const bOnline = online.has(b.user_id) ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return (a.display_name ?? '').localeCompare(b.display_name ?? '');
    });
  }, [isStoreOwner, onlineIds, profile?.display_name, rows, user]);

  const pending = useMemo(() => accounts.filter((row) => row.seller_join_status === 'pending'), [accounts]);
  const riders = useMemo(() => accounts.filter((row) => accountKind(row) === 'rider'), [accounts]);
  const admins = useMemo(() => accounts.filter((row) => accountKind(row) === 'admin'), [accounts]);
  const onlineAccounts = useMemo(
    () => accounts.filter((row) => onlineIds.includes(row.user_id)),
    [accounts, onlineIds]
  );

  if (!isStoreOwner) {
    return (
      <PageHeader
        title="Staff Acc Management"
        description="Only the master admin can approve accounts that register for WRS."
      />
    );
  }

  return (
    <div className="staff-page">
      <PageHeader
        title="Staff Acc Management"
        description="Approve or reject rider and admin accounts. They cannot sign in until you approve them."
      />
      {error ? <p className="error-text">{error}</p> : null}

      <div className="staff-summary">
        <article className="staff-summary-card">
          <span>Total accounts</span>
          <strong>{loading ? '—' : accounts.length}</strong>
        </article>
        <article className="staff-summary-card staff-summary-card--riders">
          <span>Riders</span>
          <strong>{loading ? '—' : riders.length}</strong>
        </article>
        <article className="staff-summary-card">
          <span>Admins</span>
          <strong>{loading ? '—' : admins.length}</strong>
        </article>
        <article className="staff-summary-card staff-summary-card--active">
          <span>Online</span>
          <strong>{loading ? '—' : onlineAccounts.length}</strong>
        </article>
      </div>
      <p className="staff-online-now">
        {onlineAccounts.length === 0
          ? 'Nobody is online right now.'
          : `Online now: ${onlineAccounts.map((row) => row.display_name?.trim() || 'Unnamed account').join(', ')}`}
      </p>

      <section className="card staff-section">
        <div className="staff-section-head">
          <h2>Pending approval</h2>
          <span className="chip pending">{pending.length}</span>
        </div>
        {loading ? (
          <p className="staff-empty">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="staff-empty">No pending rider or admin registrations.</p>
        ) : (
          <ul className="staff-list">
            {pending.map((row) => (
                <AccountCard
                  key={row.user_id}
                  row={row}
                  tone="pending"
                  online={onlineIds.includes(row.user_id)}
                  actions={
                  <>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busyId === row.user_id}
                      onClick={() => void setStatus(row.user_id, 'approved')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busyId === row.user_id}
                      onClick={() => void setStatus(row.user_id, 'rejected')}
                    >
                      Reject
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="card staff-section">
        <div className="staff-section-head">
          <h2>All accounts</h2>
          <span className="chip ok">{accounts.length}</span>
        </div>
        {loading ? (
          <p className="staff-empty">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="staff-empty">No rider or admin accounts yet.</p>
        ) : (
          <ul className="staff-list">
            {accounts.map((row) => {
              const approved = row.seller_join_status === 'approved';
              const isOwner = row.user_id === user?.id && isStoreOwner;
              return (
                <AccountCard
                  key={row.user_id}
                  row={row}
                  tone={approved ? 'active' : 'pending'}
                  online={onlineIds.includes(row.user_id)}
                  actions={
                    !approved ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === row.user_id}
                          onClick={() => void setStatus(row.user_id, 'approved')}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={busyId === row.user_id}
                          onClick={() => void setStatus(row.user_id, 'rejected')}
                        >
                          Reject
                        </button>
                      </>
                    ) : isOwner || accountKind(row) === 'rider' ? null : (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={busyId === row.user_id}
                        onClick={() => setRemoveTarget(row)}
                      >
                        Remove
                      </button>
                    )
                  }
                />
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={removeTarget != null}
        title="Remove admin account?"
        message={
          <>
            Remove <strong>{removeTarget?.display_name ?? removeTarget?.email ?? 'this account'}</strong>? They will
            lose access to WRS Management.
          </>
        }
        confirmLabel="Yes, remove"
        variant="danger"
        busy={removeTarget != null && busyId === removeTarget.user_id}
        onCancel={() => {
          if (busyId !== removeTarget?.user_id) setRemoveTarget(null);
        }}
        onConfirm={() => void confirmRemoveStaff()}
      />
    </div>
  );
}

function staffRegisteredLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function AccountCard({
  row,
  tone,
  online,
  actions,
}: {
  row: WorkspaceStaff;
  tone: 'pending' | 'active';
  online: boolean;
  actions: ReactNode;
}) {
  const name = row.display_name?.trim() || 'Unnamed account';
  const kind = accountKindLabel(row);
  const active = row.seller_join_status === 'approved';
  return (
    <li className={`staff-card staff-card--${tone}`}>
      <StaffAvatar name={name} path={row.avatar_path} />
      <div className="staff-card-body">
        <strong>
          {name} <span className={`staff-kind staff-kind--${kind === 'Admin' ? 'admin' : 'rider'}`}>{kind}</span>
        </strong>
        <span className="staff-email">{row.email ?? 'No email on file'}</span>
        <div className="staff-meta">
          <span>{row.phone?.trim() || 'No contact number'}</span>
          <span className={active ? 'staff-state is-active' : 'staff-state'}>{active ? 'Active' : 'Waiting'}</span>
          <span className={online ? 'staff-live is-on' : 'staff-live'}>{online ? 'Online' : 'Offline'}</span>
          {row.created_at ? <span>Registered {staffRegisteredLabel(row.created_at)}</span> : <span>Master admin</span>}
        </div>
      </div>
      {actions ? <div className="staff-actions">{actions}</div> : null}
    </li>
  );
}
