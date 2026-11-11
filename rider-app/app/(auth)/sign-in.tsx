import { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { parseAuthCredentials, sanitizeAuthEmail, sanitizeAuthPassword } from '../../lib/authInputSecurity';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { TextField } from '../../ui/components/TextField';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';

const authLogo = require('../../assets/logo.png');

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ notice?: string }>();
  const { gateMessage, clearGateMessage } = useAuth();
  const [email, setEmail] = useState('');
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [canScroll, setCanScroll] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const layoutHeight = useRef(0);
  const contentHeight = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  function updateScroll(layout: number, content: number) {
    if (layout > 0) layoutHeight.current = layout;
    if (content > 0) contentHeight.current = content;
    if (layoutHeight.current <= 0 || contentHeight.current <= 0) return;
    const next = contentHeight.current > layoutHeight.current + 8;
    setCanScroll((prev) => (prev === next ? prev : next));
  }

  useEffect(() => {
    const n = typeof params.notice === 'string' ? params.notice : null;
    setRouteNotice(n && n.trim() ? n : null);
  }, [params.notice]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardOpen(false);
      if (contentHeight.current <= layoutHeight.current + 8) {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  async function submit() {
    setError(null);
    clearGateMessage();
    setRouteNotice(null);
    setLoading(true);
    try {
      const creds = parseAuthCredentials(email, password, { mode: 'login' });
      if (!creds.ok) {
        setError(creds.error);
        return;
      }
      const { error: err } = await supabase.auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      });
      if (err) throw err;
      // Profile check runs in AuthProvider — pending staff are signed out with a notice.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen style={{ padding: 0 }}>
      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          scrollEnabled={canScroll || keyboardOpen}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
          onLayout={(e) => updateScroll(e.nativeEvent.layout.height, 0)}
          contentContainerStyle={{ flexGrow: 0 }}
        >
          <View
            style={{ padding: theme.spacing.md }}
            onLayout={(e) => updateScroll(0, e.nativeEvent.layout.height)}
          >
          <View style={{ alignItems: 'center', marginBottom: theme.spacing.md }}>
            <Image
              source={authLogo}
              style={{ width: 280, height: 168 }}
              resizeMode="contain"
              accessibilityLabel="WaterMarket"
            />
          </View>
          <Text variant="title" weight="extrabold">
            Seller Login
          </Text>
          <Text variant="muted" style={{ marginTop: 4 }}>
            Field app for orders, delivery, customers, and alerts — synced with Admin & Customer apps.
          </Text>

          <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
            {gateMessage || routeNotice ? (
              <Card>
                <Text weight="bold" style={{ color: theme.colors.primary }}>
                  Notice
                </Text>
                <Text style={{ marginTop: 8 }}>{gateMessage ?? routeNotice}</Text>
              </Card>
            ) : null}
            <Card>
              <View style={{ gap: 10 }}>
                <TextField
                  label="Email"
                  value={email}
                  onChangeText={(t) => setEmail(sanitizeAuthEmail(t))}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  maxLength={254}
                />
                <TextField
                  label="Password"
                  value={password}
                  onChangeText={(t) => setPassword(sanitizeAuthPassword(t))}
                  placeholder="Enter your password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  passwordToggleable
                  maxLength={128}
                />
                {error ? (
                  <Text weight="bold" style={{ color: theme.colors.danger }}>
                    {error}
                  </Text>
                ) : null}
                <Button title={loading ? 'Please wait…' : 'Login'} disabled={loading} onPress={submit} />
              </View>
            </Card>

            <Pressable onPress={() => router.push('/(auth)/sign-up')} style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text weight="bold" style={{ color: theme.colors.primary }}>
                Registration
              </Text>
            </Pressable>
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
