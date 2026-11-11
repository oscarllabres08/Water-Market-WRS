import type { ComponentProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { readCurrentAddress } from '../../../lib/currentAddress';
import { useAuth } from '../../../providers/AuthProvider';
import { useNotifications } from '../../../providers/NotificationsProvider';
import { supabase } from '../../../lib/supabase';
import { imageUploadPresets, prepareImageForUpload } from '../../../lib/prepareImageForUpload';
import { readPreparedImageBytes } from '../../../lib/readPreparedImageBytes';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { TextField } from '../../../ui/components/TextField';
import { Button } from '../../../ui/components/Button';
import { NotificationsMenu } from '../../../ui/components/NotificationsMenu';
import { Skeleton } from '../../../ui/components/Skeleton';
import { LogoutConfirmModal } from '../../../ui/components/LogoutConfirmModal';
import { theme } from '../../../ui/theme';

type ProfileRow = {
  display_name: string | null;
  username: string | null;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  avatar_path: string | null;
};

function usernameFromAccount(username: string | null | undefined, email: string | null | undefined): string {
  const saved = (username ?? '').trim();
  if (saved) return saved;
  const [local, domain] = (email ?? '').split('@');
  if ((domain === 'customer.watermarket.ph' || domain === 'customer.waterchaste.app') && local) return local;
  return '';
}

export default function ProfileIndexScreen() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMsg, setLocationMsg] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarStamp, setAvatarStamp] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  async function load() {
    if (authLoading) return;
    if (!user) return;
    const userId = user.id;

    setErr(null);
    setSavedMsg(null);
    setLoading(true);

    const { data: prof, error: pErr } = await supabase
      .from('profiles')
      .select('display_name,username,phone,address,latitude,longitude,avatar_path')
      .eq('user_id', userId)
      .maybeSingle();
    if (pErr) setErr(pErr.message);
    const p = (prof ?? null) as ProfileRow | null;

    const nextName = (p?.display_name ?? '').trim().replace(/\s+/g, ' ');
    let nextPhone = (p?.phone ?? '').trim();
    if (!nextPhone) {
      const { data: lastOrder } = await supabase
        .from('orders')
        .select('contact_number')
        .eq('customer_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      nextPhone = (lastOrder?.contact_number ?? '').trim();
      if (nextPhone && p) {
        p.phone = nextPhone;
        await supabase.from('profiles').update({ phone: nextPhone }).eq('user_id', userId);
      }
    }
    setProfile(p);
    const nextAddr = (p?.address ?? '').trim();
    setName(nextName);
    setPhone(nextPhone);
    setAddress(nextAddr);
    setCoords(p?.latitude != null && p?.longitude != null ? { latitude: p.latitude, longitude: p.longitude } : null);
    setAvatarPath(p?.avatar_path ?? null);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  const hasChanges = useMemo(() => {
    const baseName = (profile?.display_name ?? '').trim();
    const basePhone = (profile?.phone ?? '').trim();
    const baseAddress = (profile?.address ?? '').trim();
    const baseLat = profile?.latitude ?? null;
    const baseLng = profile?.longitude ?? null;
    const baseAvatar = profile?.avatar_path ?? null;
    const nextLat = coords?.latitude ?? null;
    const nextLng = coords?.longitude ?? null;
    const nextAvatar = avatarPath ?? null;
    return (
      name.trim() !== baseName ||
      phone.trim() !== basePhone ||
      address.trim() !== baseAddress ||
      nextLat !== baseLat ||
      nextLng !== baseLng ||
      nextAvatar !== baseAvatar
    );
  }, [profile, name, phone, address, coords, avatarPath]);

  async function saveProfile() {
    if (!user) return;
    setErr(null);
    setSavedMsg(null);
    setSaving(true);
    const savedName = name.trim().replace(/\s+/g, ' ');
    const savedPhone = phone.trim();
    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name: savedName || null,
        phone: savedPhone || null,
        address: address.trim() ? address.trim() : null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        avatar_path: avatarPath ?? null,
      })
      .eq('user_id', user.id)
      .select('display_name,username,phone,address,latitude,longitude,avatar_path')
      .maybeSingle();
    if (error || !data) {
      setErr(error?.message || 'Could not save your profile. Try again.');
    } else {
      const saved = data as ProfileRow;
      setProfile(saved);
      setName((saved.display_name ?? '').trim().replace(/\s+/g, ' '));
      setPhone((saved.phone ?? '').trim());
      setAddress((saved.address ?? '').trim());
      setCoords(
        saved.latitude != null && saved.longitude != null
          ? { latitude: saved.latitude, longitude: saved.longitude }
          : null
      );
      setAvatarPath(saved.avatar_path ?? null);
      setErr(null);
      setSavedMsg('Saved successfully.');
    }
    setSaving(false);
  }

  async function useCurrentLocation() {
    if (!user) return;
    setLocationMsg(null);
    setLocating(true);
    try {
      const result = await readCurrentAddress();
      if (!result.ok) {
        setLocationMsg(result.error);
        return;
      }
      setCoords({ latitude: result.latitude, longitude: result.longitude });
      setAddress(result.address);
      const { error } = await supabase
        .from('profiles')
        .update({
          address: result.address,
          latitude: result.latitude,
          longitude: result.longitude,
        })
        .eq('user_id', user.id);
      if (error) {
        setLocationMsg(error.message);
        return;
      }
      setProfile((prev) =>
        prev
          ? { ...prev, address: result.address, latitude: result.latitude, longitude: result.longitude }
          : prev
      );
      setLocationMsg('Address saved to your profile.');
    } finally {
      setLocating(false);
    }
  }

  function publicImageUrl(pathOrUrl?: string | null) {
    if (!pathOrUrl) return null;
    if (pathOrUrl.startsWith('http')) return pathOrUrl;
    const { data } = supabase.storage.from('wrs-assets').getPublicUrl(pathOrUrl);
    return data.publicUrl;
  }

  async function pickAvatar() {
    if (!user) return;
    setErr(null);
    setSavedMsg(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErr('Media library permission denied.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      setSaving(true);
      const prepared = await prepareImageForUpload(asset.uri, imageUploadPresets.avatar);
      const objectPath = `avatars/customer-${user.id}.jpg`;
      const bytes = await readPreparedImageBytes(prepared);

      const { error: upErr } = await supabase.storage.from('wrs-assets').upload(objectPath, bytes, {
        upsert: true,
        contentType: prepared.contentType,
        cacheControl: '60',
      });
      if (upErr) throw new Error(upErr.message);

      const { error: profErr } = await supabase.from('profiles').update({ avatar_path: objectPath }).eq('user_id', user.id);
      if (profErr) throw profErr;

      setAvatarPath(objectPath);
      setAvatarStamp(Date.now());
      setProfile((prev) => (prev ? { ...prev, avatar_path: objectPath } : prev));
      setSavedMsg('Profile photo saved.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to upload avatar';
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  const shownAvatarUri = (() => {
    const base = publicImageUrl(avatarPath);
    if (!base) return null;
    return avatarStamp ? `${base}?v=${avatarStamp}` : base;
  })();

  return (
    <Screen style={{ padding: 0 }} enter>
      <LogoutConfirmModal
        visible={logoutModalOpen}
        onDismiss={() => {
          if (!loggingOut) setLogoutModalOpen(false);
        }}
        busy={loggingOut}
        onConfirm={async () => {
          setLoggingOut(true);
          try {
            await signOut();
            setLogoutModalOpen(false);
          } finally {
            setLoggingOut(false);
          }
        }}
      />
      <NotificationsMenu visible={notifOpen} onClose={() => setNotifOpen(false)} />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text variant="title" weight="extrabold">
              Profile
            </Text>
            <Text variant="muted" style={{ marginTop: 2 }}>
              Your name, address, and orders.
            </Text>
          </View>
          <Pressable
            onPress={() => setNotifOpen(true)}
            style={{
              padding: 10,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: '#fff',
              position: 'relative',
            }}
          >
            <Ionicons name="notifications-outline" size={22} color={theme.colors.primary} />
            {unreadCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 4,
                  borderRadius: 999,
                  backgroundColor: theme.colors.primary,
                  borderWidth: 2,
                  borderColor: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="chip" weight="extrabold" style={{ color: '#fff', fontSize: 10 }}>
                  {unreadCount > 99 ? '99+' : String(unreadCount)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {!user ? (
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text variant="muted">Login to view your profile.</Text>
            <View style={{ marginTop: 12 }}>
              <Button title="Login / Register" onPress={() => router.push('/(auth)/sign-in')} />
            </View>
          </Card>
        ) : (
          <>
            <Card style={{ marginTop: theme.spacing.md, padding: 0, overflow: 'hidden' }}>
              {loading ? (
                <View style={{ gap: 10, padding: theme.spacing.md }}>
                  <Skeleton height={14} width="40%" radius={10} />
                  <Skeleton height={44} width="100%" radius={14} />
                  <Skeleton height={44} width="100%" radius={14} />
                  <Skeleton height={64} width="100%" radius={14} />
                </View>
              ) : (
                <View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: theme.spacing.md,
                      backgroundColor: 'rgba(0,183,245,0.12)',
                    }}
                  >
                    <Pressable
                      onPress={pickAvatar}
                      style={{
                        width: 76,
                        height: 76,
                        borderRadius: 38,
                        borderWidth: 3,
                        borderColor: '#fff',
                        backgroundColor: 'rgba(0,116,240,0.12)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {shownAvatarUri ? (
                        <Image source={{ uri: shownAvatarUri }} style={{ width: 76, height: 76 }} resizeMode="cover" />
                      ) : (
                        <Text weight="semibold" style={{ color: theme.colors.primary, fontSize: 28 }}>
                          {(name.trim()[0] ?? 'C').toUpperCase()}
                        </Text>
                      )}
                      <View
                        style={{
                          position: 'absolute',
                          right: 2,
                          bottom: 2,
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: theme.colors.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="camera" size={12} color="#fff" />
                      </View>
                    </Pressable>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text weight="semibold" style={{ fontSize: 18, lineHeight: 24 }}>
                        {name.trim().replace(/\s+/g, ' ') || 'Customer'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 }}>
                        <View
                          style={{
                            flexShrink: 1,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 999,
                            backgroundColor: 'rgba(255,255,255,0.8)',
                          }}
                        >
                          <Text variant="chip" numberOfLines={1} style={{ color: theme.colors.primaryDark }}>
                            @{usernameFromAccount(profile?.username, user.email) || 'username'}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => {
                            setErr(null);
                            setSavedMsg(null);
                            setEditing((v) => !v);
                          }}
                          style={{
                            marginLeft: 'auto',
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            borderRadius: 999,
                            backgroundColor: '#fff',
                          }}
                        >
                          <Text weight="semibold" style={{ color: theme.colors.primary, fontSize: 13 }}>
                            {editing ? 'Done' : 'Edit'}
                          </Text>
                        </Pressable>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Change profile photo"
                        disabled={saving}
                        onPress={() => void pickAvatar()}
                        style={{ alignSelf: 'flex-start', marginTop: 8, paddingVertical: 2 }}
                      >
                        <Text weight="semibold" style={{ color: theme.colors.primary, fontSize: 13 }}>
                          {saving ? 'Uploading photo…' : 'Change photo'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {!editing && (err || savedMsg) ? (
                    <Text
                      style={{
                        marginHorizontal: theme.spacing.md,
                        marginTop: 4,
                        color: err ? theme.colors.danger : theme.colors.success,
                        fontSize: 13,
                      }}
                    >
                      {err || savedMsg}
                    </Text>
                  ) : null}

                  {!editing ? (
                    <View style={{ padding: theme.spacing.md, gap: 12 }}>
                      <ProfileInfo icon="person-outline" label="Complete name" value={name.trim() || 'Not added yet'} />
                      <ProfileInfo
                        icon="at-outline"
                        label="Username"
                        value={usernameFromAccount(profile?.username, user.email) || 'Not set'}
                      />
                      <ProfileInfo icon="call-outline" label="Contact number" value={phone.trim() || 'Not added yet'} />
                      <ProfileInfo
                        icon="location-outline"
                        label="Address"
                        value={address.trim() || 'No address yet. Add one before you order.'}
                      />
                    </View>
                  ) : (
                    <View style={{ padding: theme.spacing.md, gap: 10 }}>
                      <Text variant="muted">Update only what you need. Username stays the same.</Text>
                      <TextField label="Complete name" value={name} onChangeText={setName} placeholder="Juan Dela Cruz" />
                      <TextField
                        label="Username"
                        value={usernameFromAccount(profile?.username, user.email) || '—'}
                        editable={false}
                      />
                      <TextField label="Contact number" value={phone} onChangeText={setPhone} placeholder="09xx xxx xxxx" inputMode="tel" />
                      <TextField
                        label="Address"
                        value={address}
                        onChangeText={setAddress}
                        placeholder="House no., street, barangay, city"
                        multiline
                        numberOfLines={3}
                        inputStyle={{ height: 72, textAlignVertical: 'top' } as any}
                      />

                      <Pressable
                        onPress={useCurrentLocation}
                        disabled={locating || saving}
                        style={{
                          alignSelf: 'flex-start',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingVertical: 7,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          backgroundColor: 'rgba(0,183,245,0.14)',
                          opacity: locating || saving ? 0.6 : 1,
                        }}
                      >
                        {locating ? (
                          <ActivityIndicator size="small" color={theme.colors.primary} />
                        ) : (
                          <Ionicons name="locate-outline" size={15} color={theme.colors.primary} />
                        )}
                        <Text weight="semibold" style={{ color: theme.colors.primary, fontSize: 13 }}>
                          {locating ? 'Finding location…' : 'Use current location'}
                        </Text>
                      </Pressable>
                      <Text variant="chip" style={{ color: theme.colors.muted }}>
                        {coords
                          ? `Saved pin ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
                          : 'No location saved yet'}
                      </Text>
                      {locationMsg ? <Text variant="muted">{locationMsg}</Text> : null}

                      {err ? (
                        <Text weight="semibold" style={{ color: theme.colors.danger }}>
                          {err}
                        </Text>
                      ) : null}
                      {savedMsg ? (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 12,
                            backgroundColor: 'rgba(47,184,74,0.12)',
                          }}
                        >
                          <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
                          <Text weight="semibold" style={{ color: theme.colors.success, flex: 1 }}>
                            {savedMsg}
                          </Text>
                        </View>
                      ) : null}

                      <View style={{ alignSelf: 'flex-start' }}>
                        <Button
                          title={saving ? 'Saving…' : 'Save changes'}
                          disabled={saving || !hasChanges}
                          onPress={saveProfile}
                          style={{ paddingVertical: 8, paddingHorizontal: 16 }}
                        />
                      </View>
                    </View>
                  )}
                </View>
              )}
            </Card>

            <Card style={{ marginTop: theme.spacing.sm }}>
              <Text weight="semibold" style={{ fontSize: 15, marginBottom: 4 }}>
                More
              </Text>
              <Row title="My orders" subtitle="Active and delivered" icon="receipt-outline" onPress={() => router.push('/(tabs)/profile/orders')} />
              <Divider />
              <Row
                title="Account settings"
                subtitle="Password"
                icon="settings-outline"
                onPress={() => router.push('/(tabs)/profile/account-settings')}
              />
              <Divider />
              <Row title="Notifications" icon="notifications-outline" onPress={() => router.push('/(tabs)/profile/notifications')} />
              <Divider />
              <Row title="Help Center" icon="help-circle-outline" onPress={() => router.push('/(tabs)/profile/help')} />
              <Divider />
              <Row title="Terms & Conditions" icon="document-text-outline" onPress={() => router.push('/legal/terms')} />
              <Divider />
              <Row title="Privacy Policy" icon="shield-checkmark-outline" onPress={() => router.push('/legal/privacy')} />
            </Card>

            <Pressable
              onPress={() => !loggingOut && setLogoutModalOpen(true)}
              disabled={loggingOut}
              style={{
                marginTop: theme.spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: 'rgba(229,72,77,0.28)',
                backgroundColor: '#fff',
                opacity: loggingOut ? 0.6 : 1,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: 'rgba(229,72,77,0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="log-out-outline" size={18} color={theme.colors.danger} />
              </View>
              <Text weight="semibold" style={{ flex: 1, color: theme.colors.danger, fontSize: 15 }}>
                {loggingOut ? 'Logging out…' : 'Log out'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

type IonIconName = ComponentProps<typeof Ionicons>['name'];

function ProfileInfo({ icon, label, value }: { icon: IonIconName; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: 'rgba(0,116,240,0.08)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={16} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="chip" style={{ color: theme.colors.muted }}>
          {label}
        </Text>
        <Text weight="semibold" style={{ marginTop: 1, lineHeight: 20 }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: theme.colors.border }} />;
}

function Row({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon: IonIconName;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          backgroundColor: 'rgba(0,116,240,0.08)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={17} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text weight="semibold">{title}</Text>
        {subtitle ? (
          <Text variant="chip" style={{ color: theme.colors.muted, marginTop: 1 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.muted} />
    </Pressable>
  );
}

