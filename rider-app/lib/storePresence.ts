import { useEffect } from 'react';

import { supabase } from './supabase';

export function useRiderPresence(businessId: string | null, userId: string | null, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !businessId || !userId) return;

    const channel = supabase.channel(`store-presence-${businessId}`, {
      config: { presence: { key: userId } },
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ user_id: userId, app: 'rider' });
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, enabled, userId]);
}
