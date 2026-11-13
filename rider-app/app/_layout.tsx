import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Pressable, Text as RNText, View } from 'react-native';

import { useColorScheme } from '../components/useColorScheme';
import { useRiderPresence } from '../lib/storePresence';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { NotificationsProvider, useNotifications } from '../providers/NotificationsProvider';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ui/components/Text';
import { theme } from '../ui/theme';
import { usePendingOrderReminder } from '../hooks/usePendingOrderReminder';
import { ensureAndroidNotificationChannels } from '../lib/notificationChannels';
import { supabaseConfigError } from '../lib/supabase';
import { getNotificationRuntimePrefs } from '../lib/notificationRuntime';
import { PendingOrderReminderBanner } from '../ui/components/PendingOrderReminderBanner';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(auth)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
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

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error && !supabaseConfigError) throw error;
  }, [error]);

  useEffect(() => {
    if (supabaseConfigError || loaded) {
      void SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    if (supabaseConfigError) return;
    void (async () => {
      try {
        await ensureAndroidNotificationChannels();
      } catch (e) {
        if (__DEV__) console.warn('[notifications] channel setup:', e);
      }
    })();
  }, []);

  if (supabaseConfigError) return <ConfigBlock />;

  if (!loaded) {
    return null;
  }

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
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationsProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : zodaNavigationTheme}>
            <AuthGate />
          </ThemeProvider>
        </NotificationsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AuthGate() {
  const { user, loading, profileLoading, accessReady, canEnterApp, businessId } = useAuth();
  useRiderPresence(businessId, user?.id ?? null, canEnterApp);
  const { toast, dismissToast } = useNotifications();
  const { visibleOrders, dismissBanner } = usePendingOrderReminder();
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reminderBannerVisible = user != null && visibleOrders.length > 0;
  const toastTop = Math.max(insets.top, 10) + 6 + (reminderBannerVisible ? 78 : 0);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (!canEnterApp) return;
      const data = response.notification.request.content.data as
        | { orderId?: string; kind?: string; pendingUserId?: string }
        | undefined;
      if (data?.kind === 'seller_registration_pending') {
        router.push('/(tabs)/notifications');
        return;
      }
      if (data?.orderId) {
        router.push(`/order/${data.orderId}`);
        return;
      }
      router.push('/(tabs)/orders');
    });
    return () => sub.remove();
  }, [canEnterApp, router]);

  const checkingAccess = loading || (Boolean(user) && (!accessReady || profileLoading));

  useEffect(() => {
    if (checkingAccess) return;
    const inAuth = segments[0] === '(auth)';
    const inTabs = segments[0] === '(tabs)';
    const onAppScreen =
      inTabs ||
      segments[0] === 'order' ||
      segments[0] === 'customer' ||
      segments[0] === 'product' ||
      segments[0] === 'pos' ||
      segments[0] === 'sales-report' ||
      segments[0] === 'modal';

    if (!canEnterApp) {
      if (!inAuth) router.replace('/(auth)/sign-in');
      return;
    }

    if (inAuth || !onAppScreen) {
      router.replace('/(tabs)/orders');
    }
  }, [checkingAccess, canEnterApp, segments, router]);

  return (
    <>
      <Stack
        screenOptions={{
          animation: 'fade_from_bottom',
          animationDuration: 320,
          /** Avoid double headers: e.g. native "order" bar + in-screen "Order details". */
          headerShown: false,
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>

      {checkingAccess ? (
        <View
          pointerEvents="auto"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: theme.colors.bg,
            zIndex: 80,
          }}
        />
      ) : null}

      {reminderBannerVisible ? (
        <PendingOrderReminderBanner
          orders={visibleOrders}
          topInset={Math.max(insets.top, 8)}
          onDismiss={() => void dismissBanner()}
        />
      ) : null}

      {toast ? (
        <Animated.View
          entering={FadeInDown.duration(320).springify().damping(16)}
          exiting={FadeOutUp.duration(180)}
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: toastTop,
            alignItems: 'center',
            zIndex: 60,
          }}
        >
          <Pressable
            onPress={() => {
              const data = (toast.data ?? {}) as { orderId?: string; kind?: string; pendingUserId?: string };
              dismissToast();
              if (!canEnterApp) return;
              if (data?.kind === 'seller_registration_pending') {
                router.push('/(tabs)/notifications');
                return;
              }
              if (data?.orderId) {
                router.push(`/order/${data.orderId}`);
                return;
              }
              router.push('/(tabs)/orders');
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
