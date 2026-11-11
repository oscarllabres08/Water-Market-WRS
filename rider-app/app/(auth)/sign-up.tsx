import { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  parseAuthCredentials,
  sanitizeAuthEmail,
  sanitizeAuthPasswordSignup,
} from '../../lib/authInputSecurity';
import { registerPendingSeller } from '../../lib/registerPendingSeller';
import { supabase } from '../../lib/supabase';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { TextField } from '../../ui/components/TextField';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';

const authLogo = require('../../assets/logo.png');

export default function SignUpScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [canScroll, setCanScroll] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const layoutHeight = useRef(0);
  const contentHeight = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

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

  function updateScroll(layout: number, content: number) {
    if (layout > 0) layoutHeight.current = layout;
    if (content > 0) contentHeight.current = content;
    if (layoutHeight.current <= 0 || contentHeight.current <= 0) return;
    const next = contentHeight.current > layoutHeight.current + 8;
    setCanScroll((prev) => (prev === next ? prev : next));
  }

  async function signUp() {
    setError(null);
    setLoading(true);
    try {
      if (!name.trim()) {
        setError('Please enter your name.');
        return;
      }
      if (!contactNumber.trim()) {
        setError('Please enter your contact number.');
        return;
      }
      const creds = parseAuthCredentials(email, password, { mode: 'signup' });
      if (!creds.ok) {
        setError(creds.error);
        return;
      }
      const confirm = sanitizeAuthPasswordSignup(confirmPassword, false);
      if (creds.password !== confirm) {
        setError('Passwords do not match.');
        return;
      }

      const { data: authData, error: err } = await supabase.auth.signUp({
        email: creds.email,
        password: creds.password,
        options: {
          data: {
            display_name: name.trim(),
            phone: contactNumber.trim(),
            seller_signup: true,
          },
        },
      });
      if (err) throw err;

      if (!authData.session) {
        router.replace({
          pathname: '/(auth)/sign-in',
          params: {
            notice:
              'Registration saved. Confirm your email if asked, then sign in — you will see a waiting-for-approval message until the administrator approves you.',
          },
        });
        return;
      }

      const { data: regObj, error: regErr } = await registerPendingSeller({
        displayName: name.trim(),
        phone: contactNumber.trim(),
      });

      if (regErr) {
        const { data: stillIn } = await supabase.auth.getSession();
        if (!stillIn.session) {
          router.replace({
            pathname: '/(auth)/sign-in',
            params: {
              notice: 'Registration submitted. You can sign in only after the store administrator approves your account.',
            },
          });
          return;
        }
        await supabase.auth.signOut();
        setError(regErr);
        return;
      }

      // The store owner is the only account that may continue. Everyone else stays signed out
      // until the master admin approves them — the app never opens Orders before that.
      if (regObj?.owner === true && regObj?.approved === true) {
        return;
      }

      await supabase.auth.signOut();
      router.replace({
        pathname: '/(auth)/sign-in',
        params: {
          notice: 'Registration submitted. You can sign in only after the store administrator approves your account.',
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
      await supabase.auth.signOut();
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
            Create seller account
          </Text>
          <Text variant="muted" style={{ marginTop: 4 }}>
            Submit your details. Your account stays inactive until approved by your store administrator.
          </Text>

          <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
            <Card>
              <View style={{ gap: 10 }}>
                <TextField label="Full name" value={name} onChangeText={setName} placeholder="Your name" />
                <TextField
                  label="Contact number"
                  value={contactNumber}
                  onChangeText={setContactNumber}
                  placeholder="09xx xxx xxxx"
                  inputMode="tel"
                />
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
                  onChangeText={(t) => setPassword(sanitizeAuthPasswordSignup(t, false))}
                  placeholder="Choose a password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  passwordToggleable
                  maxLength={128}
                />
                <TextField
                  label="Confirm password"
                  value={confirmPassword}
                  onChangeText={(t) => setConfirmPassword(sanitizeAuthPasswordSignup(t, false))}
                  placeholder="Re-enter password"
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
                <Button title={loading ? 'Please wait…' : 'Submit registration'} disabled={loading} onPress={() => void signUp()} />
              </View>
            </Card>

            <Pressable onPress={() => router.push('/(auth)/sign-in')} style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text weight="bold" style={{ color: theme.colors.primary }}>
                Back to login
              </Text>
            </Pressable>
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
