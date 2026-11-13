import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

const OnlineIdsContext = createContext<string[]>([]);

export function useOnlineUserIds() {
  return useContext(OnlineIdsContext);
}

export function StorePresence({
  businessId,
  userId,
  app,
  children,
}: {
  businessId: string | null;
  userId: string | null;
  app: 'admin' | 'rider';
  children: ReactNode;
}) {
  const [onlineIds, setOnlineIds] = useState<string[]>([]);

  useEffect(() => {
    if (!businessId || !userId) {
      setOnlineIds([]);
      return;
    }

    const channel = supabase.channel(`store-presence-${businessId}`, {
      config: { presence: { key: userId } },
    });

    const sync = () => {
      const state = channel.presenceState() as Record<string, { user_id?: string }[]>;
      const ids = new Set<string>();
      for (const [key, metas] of Object.entries(state)) {
        if (key) ids.add(key);
        for (const meta of metas ?? []) {
          if (meta?.user_id) ids.add(meta.user_id);
        }
      }
      setOnlineIds([...ids]);
    };

    channel.on('presence', { event: 'sync' }, sync);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ user_id: userId, app }).then(sync);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [app, businessId, userId]);

  return <OnlineIdsContext.Provider value={onlineIds}>{children}</OnlineIdsContext.Provider>;
}
