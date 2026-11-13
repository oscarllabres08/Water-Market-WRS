import { useCallback, useEffect, useState, type FormEvent } from 'react';



import { ConfirmModal } from '../components/ConfirmModal';
import { ModulePageHeader } from '../components/ModulePageHeader';
import { supabase } from '../lib/supabase';

import { useAuth } from '../auth/AuthProvider';

import {

  countLoyaltyEligibleProducts,

  fetchLoyaltyProgramActive,

  setLoyaltyProgramActive,

} from '../lib/loyaltyProgram';

import { verifyLoyaltyVoucherCode } from '../lib/verifyLoyaltyVoucher';



const FREE_REFILL_POINTS = 5;
const CLOSE_LIMIT = 8;

type LoyaltyCustomer = {
  key: string;
  customerId: string | null;
  nameKey: string | null;
  name: string;
  points: number;
  source: 'app' | 'walkin';
};

type VerifyUiState =

  | { kind: 'idle' }

  | { kind: 'success'; message: string; code: string }

  | { kind: 'used'; message: string; usedAt?: string }

  | { kind: 'error'; message: string };



export function LoyaltyPage() {

  const { businessId, profile } = useAuth();

  const [active, setActive] = useState(false);

  const [eligibleCount, setEligibleCount] = useState(0);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);



  const [voucherCode, setVoucherCode] = useState('');

  const [verifyBusy, setVerifyBusy] = useState(false);

  const [verifyState, setVerifyState] = useState<VerifyUiState>({ kind: 'idle' });

  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [giveTarget, setGiveTarget] = useState<LoyaltyCustomer | null>(null);
  const [giveBusy, setGiveBusy] = useState(false);
  const [giveNotice, setGiveNotice] = useState<string | null>(null);

  const [programDetailsOpen, setProgramDetailsOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );



  const branch =

    profile?.display_name?.trim() ? `${profile.display_name.trim()} · WaterMarket` : 'WaterMarket Main Branch';



  const load = useCallback(async () => {

    if (!businessId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    setError(null);

    try {

      const [on, count] = await Promise.all([

        fetchLoyaltyProgramActive(businessId),

        countLoyaltyEligibleProducts(businessId),

      ]);

      setActive(on);

      setEligibleCount(count);

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Failed to load loyalty settings');

    } finally {

      setLoading(false);

    }

  }, [businessId]);



  const loadCustomers = useCallback(async () => {
    if (!businessId) {
      setCustomersLoading(false);
      return;
    }
    setCustomersLoading(true);
    const { data, error: balErr } = await supabase
      .from('loyalty_balances')
      .select('customer_id, points_balance')
      .eq('seller_id', businessId)
      .gt('points_balance', 0)
      .order('points_balance', { ascending: false });
    if (balErr) {
      setError(balErr.message);
      setCustomers([]);
      setCustomersLoading(false);
      return;
    }
    const rows = (data ?? []) as { customer_id: string; points_balance: number }[];
    const ids = rows.map((row) => row.customer_id);
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', ids);
      for (const profileRow of profiles ?? []) {
        const row = profileRow as { user_id: string; display_name: string | null };
        names.set(row.user_id, row.display_name?.trim() || 'Customer');
      }
    }
    const appCustomers: LoyaltyCustomer[] = rows.map((row) => ({
      key: `app:${row.customer_id}`,
      customerId: row.customer_id,
      nameKey: null,
      name: names.get(row.customer_id) || 'Customer',
      points: row.points_balance,
      source: 'app',
    }));

    const { data: walkInData, error: walkErr } = await supabase
      .from('pos_loyalty_balances')
      .select('customer_name_key, display_name, points_balance')
      .eq('seller_id', businessId)
      .gt('points_balance', 0)
      .order('points_balance', { ascending: false });
    if (walkErr && !walkErr.message.includes('pos_loyalty_balances') && walkErr.code !== 'PGRST205') {
      setError(walkErr.message);
    }
    const walkIns: LoyaltyCustomer[] = walkErr
      ? []
      : ((walkInData ?? []) as { customer_name_key: string; display_name: string; points_balance: number }[]).map(
          (row) => ({
            key: `walkin:${row.customer_name_key}`,
            customerId: null,
            nameKey: row.customer_name_key,
            name: row.display_name?.trim() || 'Walk-in',
            points: row.points_balance,
            source: 'walkin',
          })
        );

    setCustomers(
      [...appCustomers, ...walkIns].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    );
    setCustomersLoading(false);
  }, [businessId]);

  useEffect(() => {
    void load();
    void loadCustomers();
  }, [load, loadCustomers]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`admin-loyalty-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loyalty_balances', filter: `seller_id=eq.${businessId}` },
        () => void loadCustomers()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_loyalty_balances', filter: `seller_id=eq.${businessId}` },
        () => void loadCustomers()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, loadCustomers]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setProgramDetailsOpen(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);



  async function onToggle(next: boolean) {

    if (!businessId) return;

    setSaving(true);

    setError(null);

    try {

      await setLoyaltyProgramActive(businessId, next);

      setActive(next);

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Could not update loyalty program');

    } finally {

      setSaving(false);

    }

  }



  async function confirmGiveRefill() {
    if (!giveTarget) return;
    setGiveBusy(true);
    setError(null);
    setGiveNotice(null);
    const { data, error: rpcError } = giveTarget.source === 'walkin'
      ? await supabase.rpc('seller_give_walkin_free_refill', {
          p_customer_name_key: giveTarget.nameKey,
        })
      : await supabase.rpc('seller_give_free_refill', {
          p_customer_id: giveTarget.customerId,
        });
    const result = data as { ok?: boolean; message?: string; points_remaining?: number; error?: string } | null;
    if (rpcError || result?.ok === false) {
      const missing =
        rpcError?.message?.includes('seller_give_free_refill') ||
        rpcError?.message?.includes('seller_give_walkin_free_refill') ||
        rpcError?.message?.includes('schema cache');
      setError(
        missing
          ? 'Run supabase/pos-loyalty.sql once in the Supabase SQL Editor, then try again.'
          : result?.message || rpcError?.message || 'Could not give the free refill.'
      );
      setGiveBusy(false);
      return;
    }
    const left = result?.points_remaining ?? Math.max(0, giveTarget.points - FREE_REFILL_POINTS);
    setGiveNotice(
      `${giveTarget.name} received 1 free refill. ${left === 0 ? 'Points are back to 0.' : `${left} points left.`}`
    );
    setGiveTarget(null);
    setGiveBusy(false);
    await loadCustomers();
  }

  async function onVerifyVoucher(e: FormEvent) {

    e.preventDefault();

    const trimmed = voucherCode.trim();

    if (trimmed.length < 6) {

      setVerifyState({ kind: 'error', message: 'Enter the customer’s voucher code (e.g. REF-A1B2C3).' });

      return;

    }

    setVerifyBusy(true);

    setVerifyState({ kind: 'idle' });

    try {

      const r = await verifyLoyaltyVoucherCode(trimmed);

      if (r.ok) {

        setVerifyState({

          kind: 'success',

          message: r.message ?? 'Verified — give 1 free container refill.',

          code: r.code ?? trimmed.toUpperCase(),

        });

        setVoucherCode('');

      } else if (r.error === 'already_used') {

        setVerifyState({

          kind: 'used',

          message: r.message ?? 'This voucher was already used.',

          usedAt: r.used_at,

        });

      } else {

        setVerifyState({

          kind: 'error',

          message: r.message ?? 'Verification failed. Check the code and try again.',

        });

      }

    } catch (ex) {

      const msg = ex instanceof Error ? ex.message : 'Could not verify voucher';

      setVerifyState({

        kind: 'error',

        message:

          msg.includes('seller_verify_loyalty') || msg.includes('schema cache')

            ? `${msg} Run supabase/migrations/0001_wrs_baseline.sql once in Supabase.`

            : msg,

      });

    } finally {

      setVerifyBusy(false);

    }

  }

  const ready = customers.filter((row) => row.points >= FREE_REFILL_POINTS);
  const close = customers.filter((row) => row.points < FREE_REFILL_POINTS).slice(0, CLOSE_LIMIT);

  return (

    <div className="loyalty-layout">

      <ModulePageHeader

        title="Loyalty points"

        subtitle="Turn the loyalty promo on when you want customers to earn and redeem points."

        branch={branch}

      />

      {error ? <p className="error-text module-alert">{error}</p> : null}

      <div className="loyalty-board">
      <div className="loyalty-side">
      <div className="card card-flat loyalty-settings-card">
        <div className="loyalty-program-head">
          <h2 className="inventory-section-title">Program status</h2>
          <label className={`loyalty-toggle${active ? ' loyalty-toggle--on' : ''}`}>
            <input
              type="checkbox"
              checked={active}
              disabled={loading || saving}
              onChange={(e) => void onToggle(e.target.checked)}
              aria-label="Loyalty points program active"
            />
            <span className="loyalty-toggle-track" aria-hidden />
            <span className="loyalty-toggle-label">{active ? 'Active' : 'Off'}</span>
          </label>
        </div>

        {!loading ? (
          <p className="loyalty-eligible-summary">
            <strong>{eligibleCount}</strong> product{eligibleCount === 1 ? '' : 's'} in Inventory
            {active ? '' : ' · turn on to start earning'}
          </p>
        ) : null}

        <details
          className="loyalty-details loyalty-program-details"
          open={programDetailsOpen}
          onToggle={(e) => setProgramDetailsOpen(e.currentTarget.open)}
        >
          <summary>About the program</summary>
          <p className="muted-block loyalty-settings-desc">
            When <strong>Active</strong>, delivered online orders can earn points on products you mark in Inventory.
            POS can also add points when you check “Add loyalty points to this order” and enter the customer name.
            {FREE_REFILL_POINTS} points = 1 free refill. App customers can still redeem a voucher. Walk-in customers are listed here,
            and you give the refill from this page — no voucher needed. When <strong>Off</strong>, online earning pauses.
            Existing voucher codes still work. When <strong>Off</strong>, online earning pauses.
            Existing voucher codes still work.
          </p>
        </details>

        {saving ? <p className="muted-block loyalty-saving-hint">Saving…</p> : null}
      </div>

      <div className="card card-flat loyalty-verify-card">
        <h2 className="inventory-section-title">Verify voucher</h2>
        <p className="muted-block loyalty-settings-desc">
          Enter the app code. If it is valid, it is marked used and you can give 1 free refill. Codes expire after 3 days.
        </p>
        <form className="loyalty-verify-form" onSubmit={(e) => void onVerifyVoucher(e)}>
          <div className="field loyalty-verify-field">
            <label htmlFor="voucher-code">Voucher code</label>
            <input
              id="voucher-code"
              type="text"
              value={voucherCode}
              onChange={(e) => {
                setVoucherCode(e.target.value);
                setVerifyState({ kind: 'idle' });
              }}
              placeholder="e.g. REF-A1B2C3"
              autoComplete="off"
              spellCheck={false}
              disabled={verifyBusy}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={verifyBusy}>
            {verifyBusy ? 'Verifying…' : 'Verify code'}
          </button>
        </form>
        {verifyState.kind === 'success' ? (
          <div className="loyalty-verify-result loyalty-verify-result--success" role="status">
            <strong>Success</strong>
            <p>{verifyState.message}</p>
            <p className="loyalty-verify-code">{verifyState.code}</p>
          </div>
        ) : null}
        {verifyState.kind === 'used' ? (
          <div className="loyalty-verify-result loyalty-verify-result--muted" role="status">
            <strong>Already used</strong>
            <p>{verifyState.message}</p>
            {verifyState.usedAt ? (
              <p className="muted-block">Used at: {new Date(verifyState.usedAt).toLocaleString('en-PH')}</p>
            ) : null}
          </div>
        ) : null}
        {verifyState.kind === 'error' ? (
          <div className="loyalty-verify-result loyalty-verify-result--error" role="alert">
            <strong>Could not verify</strong>
            <p>{verifyState.message}</p>
          </div>
        ) : null}
      </div>

      <div className="card card-flat loyalty-help-card">
        <details className="loyalty-details loyalty-help-details">
          <summary>How it works</summary>
          <ul className="loyalty-help-list">
            <li>Turn the program Active during promos or ongoing loyalty.</li>
            <li>In Inventory, mark products that earn points.</li>
            <li>1 delivered unit, or 1 POS unit when the loyalty box is checked, = 1 point.</li>
            <li>{FREE_REFILL_POINTS} points = 1 free refill. Give it here. The {FREE_REFILL_POINTS} points are then removed.</li>
          </ul>
        </details>
      </div>
      </div>

      <div className="loyalty-main">
      <div className="card card-flat loyalty-customers-card">
        <h2 className="inventory-section-title">Free refill</h2>
        <p className="muted-block loyalty-settings-desc">
          {FREE_REFILL_POINTS} points = 1 free refill. Customers at {FREE_REFILL_POINTS} or more are listed here, including walk-ins with no app.
          Give the refill and those {FREE_REFILL_POINTS} points are removed. No voucher is required for this button.
        </p>
        {giveNotice ? <p className="loyalty-give-notice">{giveNotice}</p> : null}
        {customersLoading ? <p className="muted-block">Loading customers…</p> : null}

        {!customersLoading && ready.length === 0 && close.length === 0 ? (
          <p className="muted-block">No customers are close to a free refill yet.</p>
        ) : null}

        {ready.length > 0 ? (
          <ul className="loyalty-customer-list">
            {ready.map((row) => (
              <li key={row.key} className="loyalty-customer loyalty-customer--ready">
                <div>
                  <strong>{row.name}</strong>
                  <small>
                    Ready for 1 free refill
                    {row.source === 'walkin' ? ' · Walk-in, no app' : ' · App account'}
                  </small>
                </div>
                <span className="loyalty-points-pill">{row.points} pts</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setGiveTarget(row)}>
                  Give 1 free refill
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {close.length > 0 ? (
          <>
            <h3 className="loyalty-close-title">Close to a free refill</h3>
            <ul className="loyalty-customer-list">
              {close.map((row) => (
                <li key={row.key} className="loyalty-customer">
                  <div>
                    <strong>{row.name}</strong>
                    <small>
                      {FREE_REFILL_POINTS - row.points} point{FREE_REFILL_POINTS - row.points === 1 ? '' : 's'} to go
                      {row.source === 'walkin' ? ' · Walk-in, no app' : ' · App account'}
                    </small>
                  </div>
                  <span className="loyalty-points-pill loyalty-points-pill--close">{row.points} / {FREE_REFILL_POINTS}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      </div>
      </div>

      <ConfirmModal
        open={giveTarget != null}
        title="Are you sure?"
        message={
          giveTarget ? (
            <>
              Give <strong>{giveTarget.name}</strong> 1 free refill? This uses {FREE_REFILL_POINTS} points
              {giveTarget.points - FREE_REFILL_POINTS > 0
                ? ` and leaves ${giveTarget.points - FREE_REFILL_POINTS}.`
                : ' and sets the balance back to 0.'}
              {giveTarget.source === 'walkin' ? ' No voucher is needed.' : ''}
            </>
          ) : null
        }
        confirmLabel="Give 1 free refill"
        busy={giveBusy}
        onCancel={() => {
          if (!giveBusy) setGiveTarget(null);
        }}
        onConfirm={() => void confirmGiveRefill()}
      />
    </div>
  );
}
