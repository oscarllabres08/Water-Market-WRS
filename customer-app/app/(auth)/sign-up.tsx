import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { sanitizeAuthPassword } from '../../lib/authInputSecurity';
import {
  customerUsernameEmail,
  sanitizeCustomerUsername,
  usernameTakenMessage,
  validateCompleteName,
  validateCustomerPassword,
  validateCustomerUsername,
} from '../../lib/customerUsername';
import { LEGAL_VERSION } from '../../lib/legalContent';
import { setLegalOnboardingAccepted } from '../../lib/legalOnboarding';
import { supabase } from '../../lib/supabase';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { TextField } from '../../ui/components/TextField';
import { Button } from '../../ui/components/Button';
import { LegalAcceptanceRow } from '../../ui/components/LegalAcceptanceRow';
import { theme } from '../../ui/theme';

const authLogo = require('../../assets/logo.png');

export default function SignUpScreen() {
  const router = useRouter();
  const [completeName, setCompleteName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const name = validateCompleteName(completeName);
      if (!name.ok) {
        setError(name.error);
        return;
      }
      const user = validateCustomerUsername(username);
      if (!user.ok) {
        setError(user.error);
        return;
      }
      const pass = validateCustomerPassword(password);
      if (!pass.ok) {
        setError(pass.error);
        return;
      }
      const confirm = validateCustomerPassword(confirmPassword);
      if (!confirm.ok) {
        setError(confirm.error);
        return;
      }
      if (pass.value !== confirm.value) {
        setError('Passwords do not match.');
        return;
      }
      if (!accepted) {
        setError('Please agree to the Terms & Conditions and Privacy Policy to create an account.');
        return;
      }

      const { data: taken, error: takenErr } = await supabase.rpc('customer_username_taken', {
        p_username: user.value,
      });
      if (!takenErr && taken === true) {
        setError('That username is already used. Please choose another.');
        return;
      }

      const acceptedAt = await setLegalOnboardingAccepted();
      const { data, error: err } = await supabase.auth.signUp({
        email: customerUsernameEmail(user.value),
        password: pass.value,
        options: {
          data: {
            display_name: name.value,
            username: user.value,
            terms_accepted_at: acceptedAt,
            privacy_policy_version: LEGAL_VERSION,
          },
        },
      });
      if (err) throw err;

      if (data.user?.id) {
        const withUsername = await supabase
          .from('profiles')
          .update({
            display_name: name.value,
            username: user.value,
          })
          .eq('user_id', data.user.id);
        if (withUsername.error) {
          const missingColumn = /username/i.test(withUsername.error.message) && /column|schema/i.test(withUsername.error.message);
          if (!missingColumn) throw withUsername.error;
          const fallback = await supabase
            .from('profiles')
            .update({ display_name: name.value })
            .eq('user_id', data.user.id);
          if (fallback.error) throw fallback.error;
        }
      }

      router.replace('/(tabs)');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Register failed';
      setError(usernameTakenMessage(msg) ?? msg);
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
        style={{ flex: 1 }}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', marginBottom: theme.spacing.sm }}>
          <Image
            source={authLogo}
            style={{ width: 280, height: 168 }}
            resizeMode="contain"
            accessibilityLabel="WaterMarket"
            accessibilityIgnoresInvertColors
          />
        </View>
        <Text variant="title" weight="extrabold">
          Create account
        </Text>
        <Text variant="muted" style={{ marginTop: 4 }}>
          Enter your name and a username. No email needed.
        </Text>

        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <Card>
            <View style={{ gap: 10 }}>
              <TextField
                label="Complete name"
                value={completeName}
                onChangeText={setCompleteName}
                placeholder="Juan Dela Cruz"
                autoCapitalize="words"
                maxLength={80}
              />
              <TextField
                label="Username"
                value={username}
                onChangeText={(t) => setUsername(sanitizeCustomerUsername(t))}
                placeholder="juan123"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={(t) => setPassword(sanitizeAuthPassword(t))}
                placeholder="Create a password"
                autoCapitalize="none"
                autoCorrect={false}
                passwordToggleable
                maxLength={128}
              />
              <TextField
                label="Confirm password"
                value={confirmPassword}
                onChangeText={(t) => setConfirmPassword(sanitizeAuthPassword(t))}
                placeholder="Confirm your password"
                autoCapitalize="none"
                autoCorrect={false}
                passwordToggleable
                maxLength={128}
              />
              <LegalAcceptanceRow checked={accepted} onToggle={() => setAccepted((v) => !v)} />
              {error ? (
                <Text weight="bold" style={{ color: theme.colors.danger }}>
                  {error}
                </Text>
              ) : null}
              <Button title={loading ? 'Please wait…' : 'Create account'} disabled={loading || !accepted} onPress={submit} />
            </View>
          </Card>

          <Pressable onPress={() => router.replace('/(auth)/sign-in')} style={{ alignItems: 'center' }}>
            <Text weight="bold" style={{ color: theme.colors.primary }}>
              Back to login
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

