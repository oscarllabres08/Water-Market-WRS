import { useEffect, useState } from 'react';

import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';

type RoleRow = { business_id: string; role: string };

export function useBusinessAccess() {
  const { user, isStoreOwner, isApprovedStaff, profileLoading } = useAuth();
  const userId = user?.id ?? null;
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [trackedUser, setTrackedUser] = useState<string | null>(userId);
  const [rolesLoading, setRolesLoading] = useState(Boolean(userId));

  if (userId !== trackedUser) {
    setTrackedUser(userId);
    setRoles([]);
    setRolesLoading(Boolean(userId));
  }

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('user_business_roles')
          .select('business_id,role')
          .eq('user_id', userId);
        if (!alive) return;
        if (!error) setRoles((data ?? []) as RoleRow[]);
      } finally {
        if (alive) setRolesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const has = (businessId: string) => roles.some((row) => row.business_id === businessId);
  return {
    loading: profileLoading || rolesLoading,
    wrs: isStoreOwner || isApprovedStaff || has('wrs'),
    laundry: isStoreOwner || has('laundry'),
    owner: isStoreOwner || has('owner'),
  };
}
