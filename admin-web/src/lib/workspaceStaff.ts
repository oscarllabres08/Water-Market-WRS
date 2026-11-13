import { supabase } from './supabase';

export type WorkspaceStaff = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  seller_join_status: string | null;
  created_at: string;
  signup_channel: string | null;
  avatar_path: string | null;
};

export function accountKind(row: WorkspaceStaff): 'admin' | 'rider' {
  return row.signup_channel === 'admin' ? 'admin' : 'rider';
}

export function accountKindLabel(row: WorkspaceStaff) {
  return accountKind(row) === 'admin' ? 'Admin' : 'Rider';
}

async function withAvatars(rows: WorkspaceStaff[]) {
  const ids = rows.map((row) => row.user_id).filter(Boolean);
  if (ids.length === 0) return rows;
  const { data } = await supabase.from('profiles').select('user_id,avatar_path').in('user_id', ids);
  const photos = new Map(
    ((data ?? []) as { user_id: string; avatar_path: string | null }[]).map((row) => [row.user_id, row.avatar_path ?? null])
  );
  return rows.map((row) => ({ ...row, avatar_path: row.avatar_path ?? photos.get(row.user_id) ?? null }));
}

export async function loadWorkspaceStaff(businessId: string): Promise<{ rows: WorkspaceStaff[]; notice: string | null; error: string | null }> {
  const { data, error: qErr } = await supabase.rpc('owner_list_workspace_staff');
  if (!qErr) {
    const list = (Array.isArray(data) ? data : (data ?? [])) as WorkspaceStaff[];
    const rows = await withAvatars(
      list.map((row) => ({
        ...row,
        signup_channel: row.signup_channel ?? null,
        email: row.email ?? null,
        avatar_path: row.avatar_path ?? null,
      }))
    );
    return { rows, notice: null, error: null };
  }

  const { data: fallback, error: fbErr } = await supabase
    .from('profiles')
    .select('user_id,display_name,phone,seller_join_status,created_at,avatar_path')
    .eq('seller_workspace_owner_id', businessId)
    .eq('seller_team_role', 'staff')
    .order('created_at', { ascending: false });

  if (fbErr) {
    return { rows: [], notice: null, error: qErr.message || fbErr.message };
  }

  return {
    rows: (fallback ?? []).map((row) => ({
      ...(row as Omit<WorkspaceStaff, 'email' | 'signup_channel'>),
      email: null,
      signup_channel: null,
      avatar_path: (row as { avatar_path?: string | null }).avatar_path ?? null,
    })),
    notice: qErr.message.includes('owner_list_workspace_staff')
      ? 'Staff list loaded without email. Run the latest staff list function in Supabase.'
      : null,
    error: null,
  };
}
