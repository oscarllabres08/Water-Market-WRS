import { useEffect, useState } from 'react';

import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';

type RoleRow = { business_id: string; role: string };

export function useBusinessAccess() {
  const { user, isStoreOwner, isApprovedStaff, profileLoading } = useAuth();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setRolesLoading(false);
      return;
    }
    let alive = true;
    setRolesLoading(true);
    void supabase
      .from('user_business_roles')
      .select('business_id,role')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!alive) return;
        setRoles((data ?? []) as RoleRow[]);
        setRolesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const has = (businessId: string) => roles.some((row) => row.business_id === businessId);
  return {
    loading: profileLoading || rolesLoading,
    wrs: isStoreOwner || isApprovedStaff || has('wrs'),
    laundry: isStoreOwner || has('laundry'),
    owner: isStoreOwner || has('owner'),
  };
}
