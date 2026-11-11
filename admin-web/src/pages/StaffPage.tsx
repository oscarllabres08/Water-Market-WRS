import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ConfirmModal } from '../components/ConfirmModal';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

type Row = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  seller_join_status: string | null;
  created_at: string;
};

export function StaffPage() {
  const { user, businessId, refreshProfile, isStoreOwner } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Row | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: qErr } = await supabase.rpc('owner_list_workspace_staff');
    if (!qErr) {
      const list = (Array.isArray(data) ? data : (data ?? [])) as Row[];
      setRows(list);
      setLoading(false);
      return;
    }

    // Fallback when RPC patch not applied yet — still show pending staff.
    const { data: fallback, error: fbErr } = await supabase
      .from('profiles')
      .select('user_id,display_name,phone,seller_join_status,created_at')
      .eq('seller_workspace_owner_id', businessId)
      .eq('seller_team_role', 'staff')
      .order('created_at', { ascending: false });

    if (fbErr) {
      setError(qErr.message || fbErr.message);
      setRows([]);
    } else {
      setRows(
        (fallback ?? []).map((r) => ({
          ...(r as Omit<Row, 'email'>),
          email: null,
        }))
      );
      if (qErr.message.includes('owner_list_workspace_staff')) {
        setError('Staff list loaded without email. Run supabase/migrations/0001_wrs_baseline.sql once in Supabase.');
      }
    }
    setLoading(false);
  }, [user?.id, businessId]);

  useEffect(() => {
    void load();
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-staff-${businessId}`)
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

  const pending = useMemo(() => rows.filter((r) => r.seller_join_status === 'pending'), [rows]);
  const approved = useMemo(() => rows.filter((r) => r.seller_join_status === 'approved'), [rows]);

  if (!isStoreOwner) {
    return (
      <PageHeader
        title="Riders"
        description="Only the master admin can approve or reject rider accounts."
      />
    );
  }

  return (
    <div className="staff-page">
      <PageHeader
        title="Riders"
        description="Approve or reject rider accounts. They cannot sign in until you approve them."
      />
      {error ? <p className="error-text">{error}</p> : null}

      <div className="staff-summary">
        <article className="staff-summary-card staff-summary-card--pending">
          <span>Waiting</span>
          <strong>{loading ? '—' : pending.length}</strong>
        </article>
        <article className="staff-summary-card staff-summary-card--active">
          <span>Active staff</span>
          <strong>{loading ? '—' : approved.length}</strong>
        </article>
      </div>

      <section className="card staff-section">
        <div className="staff-section-head">
          <h2>Pending approval</h2>
          <span className="chip pending">{pending.length}</span>
        </div>
        {loading ? (
          <p className="staff-empty">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="staff-empty">No pending registrations.</p>
        ) : (
          <ul className="staff-list">
            {pending.map((r) => (
              <StaffCard
                key={r.user_id}
                row={r}
                tone="pending"
                actions={
                  <>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busyId === r.user_id}
                      onClick={() => void setStatus(r.user_id, 'approved')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busyId === r.user_id}
                      onClick={() => void setStatus(r.user_id, 'rejected')}
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
          <h2>Active staff</h2>
          <span className="chip ok">{approved.length}</span>
        </div>
        {loading ? (
          <p className="staff-empty">Loading…</p>
        ) : approved.length === 0 ? (
          <p className="staff-empty">No approved staff yet.</p>
        ) : (
          <ul className="staff-list">
            {approved.map((r) => (
              <StaffCard
                key={r.user_id}
                row={r}
                tone="active"
                actions={
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busyId === r.user_id}
                    onClick={() => setRemoveTarget(r)}
                  >
                    Remove
                  </button>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={removeTarget != null}
        title="Remove staff account?"
        message={
          <>
            Remove <strong>{removeTarget?.display_name ?? removeTarget?.email ?? 'this staff member'}</strong>? They
            will lose Seller app access.
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

function staffInitial(row: Row) {
  const source = row.display_name?.trim() || row.email?.trim() || '?';
  return source[0]?.toUpperCase() ?? '?';
}

function staffRegisteredLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StaffCard({
  row,
  tone,
  actions,
}: {
  row: Row;
  tone: 'pending' | 'active';
  actions: ReactNode;
}) {
  const name = row.display_name?.trim() || 'Unnamed staff';
  return (
    <li className={`staff-card staff-card--${tone}`}>
      <span className="staff-avatar" aria-hidden>
        {staffInitial(row)}
      </span>
      <div className="staff-card-body">
        <strong>{name}</strong>
        <span className="staff-email">{row.email ?? 'No email on file'}</span>
        <div className="staff-meta">
          <span>{row.phone?.trim() || 'No contact number'}</span>
          <span>Registered {staffRegisteredLabel(row.created_at)}</span>
        </div>
      </div>
      <div className="staff-actions">{actions}</div>
    </li>
  );
}
