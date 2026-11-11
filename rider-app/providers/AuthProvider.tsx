import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { Session, User } from '@supabase/supabase-js';

import { registerPendingSeller } from '../lib/registerPendingSeller';
import { supabase } from '../lib/supabase';

export type SellerTeamRole = 'owner' | 'staff';
export type SellerJoinStatus = 'approved' | 'pending' | 'rejected';

type ProfileRow = {
  role: string;
  seller_team_role: string | null;
  seller_join_status: string | null;
  seller_workspace_owner_id: string | null;
  store_code: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  profileLoading: boolean;
  sellerProfile: ProfileRow | null;
  businessId: string | null;
  sellerTeamRole: SellerTeamRole | null;
  sellerJoinStatus: SellerJoinStatus | null;
  isStoreOwner: boolean;
  gateMessage: string | null;
  /** True only after approval is confirmed. Pending or rejected accounts never get this. */
  canEnterApp: boolean;
  /** False while a signed-in account is still being checked. */
  accessReady: boolean;
  clearGateMessage: () => void;
  refreshSellerProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const WAITING_APPROVAL_MSG =
  'Your registration is waiting for approval. You cannot sign in until the master admin approves your account on Staff account approval in the admin website.';

const REJECTED_MSG =
  'Your registration was rejected and removed. Contact the store administrator if you need access.';

function denialMessage(row: ProfileRow): string | null {
  const status = row.seller_join_status;
  const team = row.seller_team_role;
  if (status === 'rejected') return REJECTED_MSG;
  if (status === 'pending') return WAITING_APPROVAL_MSG;
  if (team === 'staff') {
    if (status !== 'approved' || !row.seller_workspace_owner_id) return WAITING_APPROVAL_MSG;
  }
  return null;
}

function computeBusinessId(p: ProfileRow | null, userId: string): string | null {
  if (!p || p.role !== 'seller' || denialMessage(p)) return null;
  const team = p.seller_team_role;
  if (team === 'staff' && p.seller_workspace_owner_id) return p.seller_workspace_owner_id;
  if (team === 'owner' || team == null) return userId;
  return null;
}

function sellerSignupMeta(session: Session | null): { displayName: string; phone: string | null } {
  const meta = (session?.user?.user_metadata ?? {}) as {
    display_name?: string;
    full_name?: string;
    phone?: string;
  };
  const displayName = String(meta.display_name ?? meta.full_name ?? '').trim();
  const phone = String(meta.phone ?? '').trim() || null;
  return { displayName, phone };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [sellerProfile, setSellerProfile] = useState<ProfileRow | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [accessReady, setAccessReady] = useState(false);
  const attemptedAutoRegisterRef = useRef<string | null>(null);
  const checkGen = useRef(0);

  const refreshSellerProfile = useCallback(async () => {
    const uid = session?.user?.id;
    const gen = ++checkGen.current;
    const stillCurrent = () => checkGen.current === gen;
    if (!uid) {
      setSellerProfile(null);
      setProfileLoading(false);
      setAccessReady(true);
      attemptedAutoRegisterRef.current = null;
      return;
    }

    setProfileLoading(true);
    try {
      const profileSelect =
        'role,seller_team_role,seller_join_status,seller_workspace_owner_id,store_code';

      const loadProfile = async () => {
        const { data, error } = await supabase.from('profiles').select(profileSelect).eq('user_id', uid).maybeSingle();
        if (error) throw error;
        return (data ?? null) as ProfileRow | null;
      };

      let row = await loadProfile();

      if (!row || row.role !== 'seller') {
        const alreadyTried = attemptedAutoRegisterRef.current === uid;
        const { displayName, phone } = sellerSignupMeta(session);
        if (!alreadyTried && displayName) {
          attemptedAutoRegisterRef.current = uid;
          const { data: regObj, error: regErr } = await registerPendingSeller({
            displayName,
            phone,
          });
          if (!regErr && regObj?.ok !== false) {
            row = await loadProfile();
          }
        }
      }

      if (!stillCurrent()) return;

      const blocked = !row || row.role !== 'seller' ? WAITING_APPROVAL_MSG : denialMessage(row);
      if (blocked) {
        setGateMessage(blocked);
        setSellerProfile(null);
        await supabase.auth.signOut();
        return;
      }

      if (!stillCurrent()) return;
      setGateMessage(null);
      setSellerProfile(row);
    } catch {
      if (!stillCurrent()) return;
      setSellerProfile(null);
      setGateMessage(WAITING_APPROVAL_MSG);
      await supabase.auth.signOut();
    } finally {
      if (stillCurrent()) {
        setProfileLoading(false);
        setAccessReady(true);
      }
    }
  }, [session]);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        const next = data.session ?? null;
        setSession(next);
        if (next?.user) {
          setProfileLoading(true);
          setAccessReady(false);
          setSellerProfile(null);
        } else {
          setAccessReady(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession ?? null);
      if (!nextSession?.user) {
        setSellerProfile(null);
        setProfileLoading(false);
        setAccessReady(true);
        return;
      }
      if (event === 'SIGNED_IN') {
        setSellerProfile(null);
        setProfileLoading(true);
        setAccessReady(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshSellerProfile();
  }, [refreshSellerProfile]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || !sellerProfile) {
      setBusinessId(null);
      return;
    }
    const fallback = computeBusinessId(sellerProfile, uid);
    setBusinessId(fallback);
    let cancelled = false;
    void supabase.rpc('seller_business_id', { uid }).then(({ data, error }) => {
      if (cancelled) return;
      setBusinessId(!error && typeof data === 'string' && data ? data : fallback);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, sellerProfile]);

  const sellerTeamRole = useMemo(() => {
    const t = sellerProfile?.seller_team_role;
    if (t === 'owner' || t === 'staff') return t;
    if (sellerProfile?.role === 'seller' && t == null) return 'owner' as const;
    return null;
  }, [sellerProfile]);

  const sellerJoinStatus = useMemo(() => {
    const j = sellerProfile?.seller_join_status;
    if (j === 'approved' || j === 'pending' || j === 'rejected') return j;
    if (sellerProfile?.role === 'seller') return 'approved' as const;
    return null;
  }, [sellerProfile]);

  const isStoreOwner = sellerTeamRole === 'owner';
  const canEnterApp = Boolean(session?.user && sellerProfile && businessId && !gateMessage);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      profileLoading,
      sellerProfile,
      businessId,
      sellerTeamRole,
      sellerJoinStatus,
      isStoreOwner,
      gateMessage,
      canEnterApp,
      accessReady,
      clearGateMessage: () => setGateMessage(null),
      refreshSellerProfile,
      signOut: async () => {
        await supabase.auth.signOut();
        setSellerProfile(null);
      },
    }),
    [
      session,
      loading,
      profileLoading,
      sellerProfile,
      businessId,
      sellerTeamRole,
      sellerJoinStatus,
      isStoreOwner,
      gateMessage,
      canEnterApp,
      accessReady,
      refreshSellerProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
