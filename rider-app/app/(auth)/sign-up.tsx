import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  parseAuthCredentials,
  sanitizeAuthEmail,
  sanitizeAuthPasswordSignup,
} from '../../lib/authInputSecurity';
import { registerPendingSeller } from '../../lib/registerPendingSeller';
import { supabase } from '../../lib/supabase';
import { AuthScreenLayout } from '../../ui/components/AuthScreenLayout';
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
            signup_channel: 'rider',
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
    <AuthScreenLayout
      logo={authLogo}
      kicker="Deliveries"
      brand="WaterMarket Rider"
      tagline="New rider accounts stay closed until the store admin approves them."
      highlights={['Name & contact', 'Store approval', 'Then sign in']}
      title="Create rider account"
      subtitle="Submit your details. You can sign in after approval."
      footer={
        <Pressable onPress={() => router.push('/(auth)/sign-in')} style={{ alignItems: 'center', paddingVertical: 10 }}>
          <Text weight="bold" style={{ color: theme.colors.primary }}>
            Back to login
          </Text>
        </Pressable>
      }
    >
      <View style={{ gap: theme.spacing.sm }}>
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
    </AuthScreenLayout>
  );
}