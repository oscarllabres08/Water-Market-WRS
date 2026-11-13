import { publicWrsAssetUrl } from '../lib/format';
import { supabase } from '../lib/supabase';

export function StaffAvatar({ name, path }: { name: string; path?: string | null }) {
  const url = publicWrsAssetUrl(supabase, path);
  const initial = (name.trim()[0] || '?').toUpperCase();
  return (
    <span className="staff-avatar" aria-hidden>
      {url ? <img src={url} alt="" /> : initial}
    </span>
  );
}
