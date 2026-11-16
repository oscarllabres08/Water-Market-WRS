import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { parseAuthCredentials, sanitizeAuthEmail, sanitizeAuthPassword } from '../../lib/authInputSecurity';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { AuthScreenLayout } from '../../ui/components/AuthScreenLayout';
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

  useEffect(() => {
    const n = typeof params.notice === 'string' ? params.notice : null;
    setRouteNotice(n && n.trim() ? n : null);
  }, [params.notice]);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreenLayout
      logo={authLogo}
      kicker="Deliveries"
      brand="WaterMarket Rider"
      tagline="Assigned jobs, maps, and customer updates in one place."
      highlights={['Assigned jobs', 'Open maps', 'Call customers']}
      title="Rider login"
      subtitle="Sign in with the account approved by the store admin."
      footer={
        <Pressable onPress={() => router.push('/(auth)/sign-up')} style={{ alignItems: 'center', paddingVertical: 10 }}>
          <Text weight="bold" style={{ color: theme.colors.primary }}>
            Registration
          </Text>
        </Pressable>
      }
    >
      {gateMessage || routeNotice ? (
        <Card>
          <Text weight="bold" style={{ color: theme.colors.primaryDark }}>
            Notice
          </Text>
          <Text style={{ marginTop: 8, lineHeight: 20 }}>{gateMessage ?? routeNotice}</Text>
        </Card>
      ) : null}
      <View style={{ gap: theme.spacing.sm }}>
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
    </AuthScreenLayout>
  );
}