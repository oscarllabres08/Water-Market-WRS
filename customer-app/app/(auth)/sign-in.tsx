import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { sanitizeAuthPassword } from '../../lib/authInputSecurity';
import { customerLoginEmail, sanitizeCustomerLogin, usernameTakenMessage } from '../../lib/customerUsername';
import { supabase } from '../../lib/supabase';
import { AuthScreenLayout } from '../../ui/components/AuthScreenLayout';
import { Text } from '../../ui/components/Text';
import { TextField } from '../../ui/components/TextField';
import { Button } from '../../ui/components/Button';
import { LegalAcceptanceRow } from '../../ui/components/LegalAcceptanceRow';
import { theme } from '../../ui/theme';

const authLogo = require('../../assets/logo.png');

export default function SignInScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    if (!accepted) {
      setError('Please agree to the Terms & Conditions and Privacy Policy to log in.');
      return;
    }
    setLoading(true);
    try {
      const login = customerLoginEmail(username);
      if (!login.ok) {
        setError(login.error);
        return;
      }
      if (!password) {
        setError('Please enter your password.');
        return;
      }
      const { error: err } = await supabase.auth.signInWithPassword({
        email: login.email,
        password,
      });
      if (err) throw err;
      router.replace('/(tabs)');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      setError(usernameTakenMessage(msg) ?? (msg === 'Invalid login credentials' ? 'Wrong username or password.' : msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreenLayout
      logo={authLogo}
      kicker="Water refilling and ice"
      brand="WaterMarket"
      tagline="Order water and ice, then follow the delivery to your door."
      highlights={['Browse products', 'Track delivery', 'GCash / Maya']}
      title="Login"
      subtitle="Sign in with your username to place an order."
      footer={
        <Pressable onPress={() => router.push('/(auth)/sign-up')} style={{ alignItems: 'center', paddingVertical: 10 }}>
          <Text weight="bold" style={{ color: theme.colors.primary }}>
            Create account
          </Text>
        </Pressable>
      }
    >
      <View style={{ gap: theme.spacing.sm }}>
          <TextField
            label="Username"
            value={username}
            onChangeText={(t) => {
              const cleaned = sanitizeCustomerLogin(t);
              setUsername(cleaned.includes('@') ? cleaned : cleaned.toLowerCase());
            }}
            placeholder="juan123"
            autoCapitalize="none"
            autoCorrect={false}
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
          <LegalAcceptanceRow checked={accepted} onToggle={() => setAccepted((v) => !v)} />
          {error ? (
            <Text weight="bold" style={{ color: theme.colors.danger }}>
              {error}
            </Text>
          ) : null}
          <Button title={loading ? 'Please wait…' : 'Login'} disabled={loading || !accepted} onPress={submit} />
      </View>
    </AuthScreenLayout>
  );
}