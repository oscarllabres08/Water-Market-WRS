import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { imageUploadPresets, prepareImageForUpload } from '../../../lib/prepareImageForUpload';
import { readPreparedImageBytes } from '../../../lib/readPreparedImageBytes';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../providers/AuthProvider';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { GradientCard } from '../../../ui/components/GradientCard';
import { Text } from '../../../ui/components/Text';
import { Button } from '../../../ui/components/Button';
import { theme } from '../../../ui/theme';
import { SellerProfileSkeleton } from '../../../ui/components/Skeleton';
import { LogoutConfirmModal } from '../../../ui/components/LogoutConfirmModal';
import { SellerScreenHeader } from '../../../ui/components/SellerScreenHeader';

type ProfileRow = {
  display_name: string | null;
  avatar_path: string | null;
  store_name: string | null;
  store_logo_url: string | null;
};

const BUCKET = 'wrs-assets';

export default function ProfileHomeScreen() {
  const router = useRouter();
  const { user, signOut, isStoreOwner, sellerTeamRole, businessId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [ownerStore, setOwnerStore] = useState<{ store_name: string | null; store_logo_url: string | null } | null>(null);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarStamp, setAvatarStamp] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const publicAvatarUrl = useMemo(() => {
    if (!avatarPath) return null;
    const base = avatarPath.startsWith('http') ? avatarPath : supabase.storage.from(BUCKET).getPublicUrl(avatarPath).data.publicUrl;
    return avatarStamp ? `${base}?v=${avatarStamp}` : base;
  }, [avatarPath, avatarStamp]);

  const load = useCallback(async () => {
    if (!user) return;
    const userId = user.id;
    setError(null);
    setLoading(true);
    const { data, error: pErr } = await supabase
      .from('profiles')
      .select('display_name,avatar_path,store_name,store_logo_url')
      .eq('user_id', userId)
      .single();
    if (pErr) {
      const msg = pErr.message.includes('does not exist')
        ? `${pErr.message}\n\nRun supabase/migrations/0001_wrs_baseline.sql once in the Supabase SQL Editor.`
        : pErr.message;
      setError(msg);
    }
    const row = (data ?? null) as ProfileRow | null;
    setProfile(row);
    setAvatarPath(row?.avatar_path ?? null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh when coming back from Business Profile (logo changes).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!businessId || sellerTeamRole !== 'staff') {
      setOwnerStore(null);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('store_name,store_logo_url')
        .eq('user_id', businessId)
        .maybeSingle();
      if (!alive) return;
      setOwnerStore(data as { store_name: string | null; store_logo_url: string | null } | null);
    })();
    return () => {
      alive = false;
    };
  }, [businessId, sellerTeamRole]);

  async function pickAvatar() {
    if (!user || uploadingPhoto) return;
    setError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('Allow photo access to set your profile photo.');
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

      setUploadingPhoto(true);
      const prepared = await prepareImageForUpload(asset.uri, imageUploadPresets.avatar);
      const objectPath = `avatars/seller-${user.id}.jpg`;
      const bytes = await readPreparedImageBytes(prepared);
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
        upsert: true,
        contentType: prepared.contentType,
        cacheControl: '60',
      });
      if (upErr) throw new Error(upErr.message);

      const { error: profErr } = await supabase.from('profiles').update({ avatar_path: objectPath }).eq('user_id', user.id);
      if (profErr) throw profErr;

      setAvatarPath(objectPath);
      setAvatarStamp(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the profile photo.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  const riderTitle = sellerTeamRole === 'staff' ? 'Rider' : (ownerStore?.store_name ?? profile?.store_name) || 'Rider';
  const riderSubtitle = sellerTeamRole === 'staff' ? profile?.display_name?.trim() || 'Delivery rider' : user?.email ?? '';

  return (
    <Screen>
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
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xl }}>
        <SellerScreenHeader subtitle="Profile" />

        {loading ? <SellerProfileSkeleton /> : null}
        {error ? (
          <Text style={{ color: theme.colors.danger }} weight="semibold">
            {error}
          </Text>
        ) : null}

        {!loading ? (
          <Animated.View entering={FadeInDown.duration(220)} style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
            <GradientCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable
                  onPress={() => void pickAvatar()}
                  disabled={uploadingPhoto}
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 18,
                    backgroundColor: 'rgba(255,255,255,0.16)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.22)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {publicAvatarUrl ? (
                    <Image source={{ uri: publicAvatarUrl }} style={{ width: 54, height: 54 }} />
                  ) : (
                    <Ionicons name="person" size={24} color="#FFFFFF" />
                  )}
                  <View
                    style={{
                      position: 'absolute',
                      right: 0,
                      bottom: 0,
                      width: 20,
                      height: 20,
                      borderRadius: 8,
                      backgroundColor: 'rgba(7,20,46,0.72)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {uploadingPhoto ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="camera" size={12} color="#FFFFFF" />
                    )}
                  </View>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text variant="h2" weight="extrabold" style={{ color: '#FFFFFF' }}>
                    {riderTitle}
                  </Text>
                  <Text variant="muted" weight="semibold" style={{ color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                    {riderSubtitle}
                  </Text>
                </View>
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 14,
                    backgroundColor: 'rgba(255,255,255,0.16)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.22)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                  <Text variant="chip" weight="extrabold" style={{ color: '#FFFFFF' }}>
                    Verified
                  </Text>
                </View>
              </View>
            </GradientCard>

            {isStoreOwner ? (
              <Card>
                <Text weight="semibold">Store back-office</Text>
                <Text variant="muted" weight="semibold" style={{ marginTop: 4 }}>
                  Business profile, e-wallets, vouchers, POS, inventory, and staff — use the WaterMarket Admin website on desktop.
                </Text>
              </Card>
            ) : null}

            <Card>
              <MenuRow
                title="Customers list"
                icon="people-outline"
                onPress={() => router.push('/(tabs)/profile/customers')}
              />
              <Divider />
              <MenuRow title="Account settings" icon="settings-outline" onPress={() => router.push('/(tabs)/profile/settings')} />
              <Divider />
              <MenuRow title="Help Center" icon="help-circle-outline" onPress={() => router.push('/(tabs)/profile/help')} />
              <Divider />
              <MenuRow
                title="Notification settings"
                icon="notifications-outline"
                onPress={() => router.push('/(tabs)/profile/notification-settings')}
              />
            </Card>

            <Card>
              <Text variant="muted" weight="semibold">
                End session
              </Text>
              <View style={{ marginTop: 10 }}>
                <Button variant="ghost" title="Logout" disabled={loggingOut} onPress={() => !loggingOut && setLogoutModalOpen(true)} />
              </View>
            </Card>
          </Animated.View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: theme.colors.border }} />;
}

type IonIconName = ComponentProps<typeof Ionicons>['name'];

function MenuRow({ title, icon, onPress }: { title: string; icon: IonIconName; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: 'rgba(0,114,240,0.08)',
          borderWidth: 1,
          borderColor: 'rgba(0,114,240,0.12)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <Text weight="semibold" style={{ flex: 1 }}>
        {title}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
    </Pressable>
  );
}

