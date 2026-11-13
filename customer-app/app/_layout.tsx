import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect } from 'react';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Pressable, Text as RNText, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';

import { ensureAndroidNotificationChannels } from '../lib/notificationChannels';
import { supabaseConfigError } from '../lib/supabase';
import { getNotificationRuntimePrefs } from '../lib/notificationRuntime';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { NotificationsProvider, useNotifications } from '../providers/NotificationsProvider';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ui/components/Text';
import { theme } from '../ui/theme';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = { initialRouteName: '(tabs)' };

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification?.request?.content?.data as Record<string, unknown> | undefined;
    const soundOnly = data?.soundOnly === '1';
    if (soundOnly) {
      return {
        shouldShowAlert: false,
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }
    const { notificationsEnabled, soundEnabled } = getNotificationRuntimePrefs();
    const show = notificationsEnabled;
    return {
      shouldShowAlert: show,
      shouldShowBanner: show,
      shouldShowList: show,
      // Play the channel sound with the real title and message.
      // A separate blank alert was showing up empty and only vibrating.
      shouldPlaySound: show && soundEnabled,
      shouldSetBadge: false,
    };
  },
});

function ConfigBlock() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F3F8FC' }}>
      <RNText style={{ fontSize: 20, fontWeight: '700', color: '#0B3A96' }}>WaterMarket cannot open</RNText>
      <RNText style={{ marginTop: 10, fontSize: 15, lineHeight: 22, color: '#16325C' }}>{supabaseConfigError}</RNText>
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    ...Ionicons.font,
  });

  useEffect(() => {
    if (error && !supabaseConfigError) throw error;
  }, [error]);

  useEffect(() => {
    if (supabaseConfigError || loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  useEffect(() => {
    if (supabaseConfigError) return;
    void ensureAndroidNotificationChannels().catch((e) => {
      if (__DEV__) console.warn('[notifications] channel setup:', e);
    });
  }, []);

  if (supabaseConfigError) return <ConfigBlock />;
  if (!loaded) return null;
  return <RootLayoutNav />;
}

const zodaNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: theme.colors.primary,
    background: theme.colors.bg,
    card: theme.colors.card,
    text: theme.colors.text,
    border: theme.colors.border,
  },
};

function RootLayoutNav() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationsProvider>
          <ThemeProvider value={zodaNavigationTheme}>
            <AuthGate />
          </ThemeProvider>
        </NotificationsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  const { toast, dismissToast } = useNotifications();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const orderHrefFor = useCallback(
    (orderId: string) => {
      const segs = segments as string[];
      const inProfileOrders = segs.includes('profile') && segs.includes('orders');
      if (inProfileOrders) return `/order/${orderId}?returnTo=profile-orders`;
      return `/order/${orderId}`;
    },
    [segments]
  );

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { orderId?: string } | undefined;
      if (data?.orderId) router.push(orderHrefFor(data.orderId) as Href);
    });
    return () => sub.remove();
  }, [router, orderHrefFor]);

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === '(auth)';
    const authScreen = segments[1];
    const inLegal = segments[0] === 'legal';
    const onLegalWelcome = inAuth && authScreen === 'legal-welcome';

    if (!user) {
      if (onLegalWelcome) {
        router.replace('/(auth)/sign-in');
        return;
      }
      if (!inAuth && !inLegal) {
        router.replace('/(auth)/sign-in');
      }
      return;
    }

    if (user && inAuth) router.replace('/(tabs)');
  }, [user, loading, segments, router]);

  return (
    <>
      <Stack screenOptions={{ animation: 'fade_from_bottom', animationDuration: 320 }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="order" options={{ headerShown: false }} />
        <Stack.Screen name="legal" options={{ headerShown: false }} />
      </Stack>

      {toast ? (
        <Animated.View
          entering={FadeInDown.duration(320).springify().damping(16)}
          exiting={FadeOutUp.duration(180)}
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: Math.max(insets.top, 10) + 6,
            alignItems: 'center',
          }}
        >
          <Pressable
            onPress={() => {
              const data = (toast.data ?? {}) as { orderId?: string };
              dismissToast();
              if (data?.orderId) {
                router.push(orderHrefFor(data.orderId) as Href);
              }
            }}
            style={{
              width: '92%',
              maxWidth: 420,
              borderRadius: 16,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingVertical: 12,
              paddingHorizontal: 12,
              ...{
                shadowColor: theme.shadow.ink,
                shadowOpacity: 0.12,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
                elevation: 6,
              },
            }}
          >
            <Text weight="extrabold" numberOfLines={1} style={{ fontSize: 13 }}>
              {toast.title}
            </Text>
            <Text variant="muted" numberOfLines={2} style={{ marginTop: 2, fontSize: 12, lineHeight: 16 }}>
              {toast.body}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </>
  );
}

