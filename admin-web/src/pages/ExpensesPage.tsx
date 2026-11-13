import { useCallback, useEffect, useMemo, useState } from 'react';

import { ConfirmModal } from '../components/ConfirmModal';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../auth/AuthProvider';
import {
  EXPENSE_TYPES,
  expenseTypeLabel,
  formatExpenseDateLabel,
  todayDateInputValue,
  type ExpenseType,
} from '../lib/expenseTypes';
import { money } from '../lib/format';
import { supabase } from '../lib/supabase';

type ExpenseRow = {
  id: string;
  expense_type: ExpenseType;
  others_label: string | null;
  amount: number;
  expense_date: string;
  notes: string | null;
  created_at: string;
};

export function ExpensesPage({ businessUnit = 'wrs' }: { businessUnit?: 'wrs' | 'laundry' }) {
  const { businessId } = useAuth();
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [editDraft, setEditDraft] = useState<{
    id: string;
    expenseType: ExpenseType;
    othersLabel: string;
    amount: string;
    expenseDate: string;
    notes: string;
  } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [viewDate, setViewDate] = useState(todayDateInputValue);
  const [viewAllDates, setViewAllDates] = useState(false);

  const [expenseType, setExpenseType] = useState<ExpenseType>('water_bill');
  const [othersLabel, setOthersLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayDateInputValue);
  const [notes, setNotes] = useState('');

  const today = todayDateInputValue();
  const isViewingToday = !viewAllDates && viewDate === today;

  const load = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    let query = supabase
      .from('business_expenses')
      .select('id,expense_type,others_label,amount,expense_date,notes,created_at')
      .eq('seller_id', businessId)
      .eq('business_unit', businessUnit);

    if (!viewAllDates) {
      query = query.eq('expense_date', viewDate);
    }

    const { data, error: err } = await query
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(viewAllDates ? 200 : 100);

    if (err) setLoadError(err.message);
    setRows((data ?? []) as ExpenseRow[]);
    setLoading(false);
  }, [businessId, businessUnit, viewAllDates, viewDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editDraft || editSaving) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeEdit();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editDraft, editSaving]);

  useEffect(() => {
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-expenses-${businessId}-${businessUnit}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'business_expenses', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, businessUnit, load]);

  const dayTotal = useMemo(() => rows.reduce((sum, r) => sum + Number(r.amount), 0), [rows]);

  const listTitle = viewAllDates ? 'All recent expenses' : `Expenses on ${formatExpenseDateLabel(viewDate)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('Enter a valid amount greater than zero.');
      return;
    }
    if (expenseType === 'others' && !othersLabel.trim()) {
      setFormError('Please describe the expense under Others.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const { error: err } = await supabase.from('business_expenses').insert({
        seller_id: businessId,
        business_unit: businessUnit,
        expense_type: expenseType,
        others_label: expenseType === 'others' ? othersLabel.trim() : null,
        amount: amt,
        expense_date: expenseDate,
        notes: notes.trim() || null,
      });
      if (err) throw err;
      setAmount('');
      setOthersLabel('');
      setNotes('');
      setExpenseType('water_bill');
      setExpenseDate(todayDateInputValue());
      if (!viewAllDates) setViewDate(expenseDate);
      await load();
    } catch (ex) {
      setFormError(ex instanceof Error ? ex.message : 'Could not save expense');
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(row: ExpenseRow) {
    setEditDraft({
      id: row.id,
      expenseType: row.expense_type,
      othersLabel: row.others_label ?? '',
      amount: String(Number(row.amount)),
      expenseDate: row.expense_date.slice(0, 10),
      notes: row.notes ?? '',
    });
    setEditError(null);
  }

  function closeEdit() {
    if (editSaving) return;
    setEditDraft(null);
    setEditError(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessId || !editDraft) return;
    const amt = Number(editDraft.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setEditError('Enter a valid amount greater than zero.');
      return;
    }
    if (editDraft.expenseType === 'others' && !editDraft.othersLabel.trim()) {
      setEditError('Please describe the expense under Others.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const { data, error: err } = await supabase
        .from('business_expenses')
        .update({
          expense_type: editDraft.expenseType,
          others_label: editDraft.expenseType === 'others' ? editDraft.othersLabel.trim() : null,
          amount: amt,
          expense_date: editDraft.expenseDate,
          notes: editDraft.notes.trim() || null,
        })
        .eq('id', editDraft.id)
        .eq('seller_id', businessId)
        .eq('business_unit', businessUnit)
        .select('id');
      if (err) throw err;
      if (!data?.length) throw new Error('Could not update this expense.');
      if (!viewAllDates) setViewDate(editDraft.expenseDate);
      setEditDraft(null);
      await load();
    } catch (ex) {
      setEditError(ex instanceof Error ? ex.message : 'Could not save expense');
    } finally {
      setEditSaving(false);
    }
  }

  async function confirmRemoveExpense() {
    if (!businessId || !deleteTarget) return;
    setDeleteBusy(true);
    setLoadError(null);
    const { data, error: err } = await supabase
      .from('business_expenses')
      .delete()
      .eq('id', deleteTarget.id)
      .eq('seller_id', businessId)
      .eq('business_unit', businessUnit)
      .select('id');
    if (err) setLoadError(err.message);
    else if (!data?.length) setLoadError('Could not delete this expense.');
    else {
      if (editDraft?.id === deleteTarget.id) closeEdit();
      setDeleteTarget(null);
      await load();
    }
    setDeleteBusy(false);
  }

  function showToday() {
    setViewAllDates(false);
    setViewDate(todayDateInputValue());
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Pick a date to review costs, then add new entries below. Dashboard net income uses today's sales minus today's expenses."
      />

      <div className="customer-toolbar card card-flat">
        <label className="customer-search" htmlFor="exp-view-date">
          <span>Date</span>
          <input
            id="exp-view-date"
            type="date"
            value={viewDate}
            disabled={viewAllDates}
            onChange={(e) => {
              setViewAllDates(false);
              setViewDate(e.target.value);
            }}
          />
        </label>
        <div className="customer-filter-group">
          <span>Show</span>
          <div className="customer-pills" role="group" aria-label="Expense date filter">
            <button type="button" className={`customer-pill${isViewingToday ? ' active' : ''}`} onClick={showToday}>
              Today
            </button>
            <button type="button" className={`customer-pill${viewAllDates ? ' active' : ''}`} onClick={() => setViewAllDates(true)}>
              All dates
            </button>
          </div>
        </div>
        <div className="expenses-totals">
          <span>{loading ? '…' : rows.length} entries</span>
          <strong>{loading ? '…' : money(dayTotal)}</strong>
        </div>
      </div>

      <div className="expenses-board">
      <div className="card card-flat expenses-form-card">
        <h2 className="card-title expenses-section-title">Add expense</h2>
        {formError ? <p className="error-text">{formError}</p> : null}
        <form className="expenses-form" onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="exp-type">Type</label>
            <select id="exp-type" value={expenseType} onChange={(e) => setExpenseType(e.target.value as ExpenseType)}>
              {EXPENSE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="exp-amount">Amount (₱)</label>
            <input
              id="exp-amount"
              type="number"
              min={0.01}
              step="0.01"
              placeholder="1500.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          {expenseType === 'others' ? (
            <div className="field">
              <label htmlFor="exp-others">Others — describe</label>
              <input
                id="exp-others"
                value={othersLabel}
                onChange={(e) => setOthersLabel(e.target.value)}
                placeholder="e.g. Maintenance, supplies"
                required
              />
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="exp-date">Expense date</label>
            <input
              id="exp-date"
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="exp-notes">Notes (optional)</label>
            <input
              id="exp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Receipt ref, remarks…"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-water expenses-form-submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save expense'}
          </button>
        </form>
      </div>

      <div className="card expenses-list-card">
        <h2 className="expenses-list-title">{listTitle}</h2>
        {loadError ? <p className="error-text">{loadError}</p> : null}
        {loading ? <p className="muted-block">Loading…</p> : null}
        {!loading && rows.length === 0 ? (
          <p className="muted-block">
            {viewAllDates ? 'No expenses recorded yet.' : `No expenses on ${formatExpenseDateLabel(viewDate)}.`}
          </p>
        ) : null}
        {!loading && rows.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table expenses-table">
              <thead>
                <tr>
                  {viewAllDates ? <th>Date</th> : null}
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    {viewAllDates ? <td>{formatExpenseDateLabel(r.expense_date)}</td> : null}
                    <td>{expenseTypeLabel(r.expense_type, r.others_label)}</td>
                    <td>{money(Number(r.amount))}</td>
                    <td>{r.notes?.trim() || '—'}</td>
                    <td>
                      <div className="expenses-row-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => beginEdit(r)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(r)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      </div>

      {editDraft ? (
        <div className="modal-backdrop" role="presentation" onClick={closeEdit}>
          <div
            className="modal-card expenses-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-edit-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="expense-edit-title" className="card-title">Edit expense</h2>
            {editError ? <p className="error-text">{editError}</p> : null}
            <form className="expenses-form" onSubmit={(e) => void saveEdit(e)}>
              <div className="field">
                <label htmlFor="edit-exp-type">Type</label>
                <select
                  id="edit-exp-type"
                  value={editDraft.expenseType}
                  onChange={(e) => setEditDraft({ ...editDraft, expenseType: e.target.value as ExpenseType })}
                >
                  {EXPENSE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="edit-exp-amount">Amount (₱)</label>
                <input
                  id="edit-exp-amount"
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={editDraft.amount}
                  onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })}
                  required
                />
              </div>
              {editDraft.expenseType === 'others' ? (
                <div className="field">
                  <label htmlFor="edit-exp-others">Others — describe</label>
                  <input
                    id="edit-exp-others"
                    value={editDraft.othersLabel}
                    onChange={(e) => setEditDraft({ ...editDraft, othersLabel: e.target.value })}
                    placeholder="e.g. Maintenance, supplies"
                    required
                  />
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="edit-exp-date">Expense date</label>
                <input
                  id="edit-exp-date"
                  type="date"
                  value={editDraft.expenseDate}
                  onChange={(e) => setEditDraft({ ...editDraft, expenseDate: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="edit-exp-notes">Notes (optional)</label>
                <input
                  id="edit-exp-notes"
                  value={editDraft.notes}
                  onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                  placeholder="Receipt ref, remarks…"
                />
              </div>
              <div className="expenses-form-actions">
                <button type="button" className="btn btn-ghost" disabled={editSaving} onClick={closeEdit}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-water" disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={deleteTarget != null}
        title="Delete expense?"
        message={
          deleteTarget
            ? `Delete ${expenseTypeLabel(deleteTarget.expense_type, deleteTarget.others_label)} (${money(Number(deleteTarget.amount))})? This cannot be undone.`
            : 'Delete this expense entry? This cannot be undone.'
        }
        confirmLabel="Yes, delete"
        variant="danger"
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmRemoveExpense()}
      />
    </>
  );
}
