import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { LEGAL_LAST_UPDATED, LEGAL_WELCOME_SUMMARY } from '../../lib/legalContent';
import { setLegalOnboardingAccepted } from '../../lib/legalOnboarding';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { LegalAcceptanceRow } from '../../ui/components/LegalAcceptanceRow';
import { theme } from '../../ui/theme';

const authLogo = require('../../assets/logo.png');

export default function LegalWelcomeScreen() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function continueToLogin() {
    setError(null);
    if (!accepted) {
      setError('Please agree to the Terms & Conditions and Privacy Policy to continue.');
      return;
    }
    setBusy(true);
    try {
      await setLegalOnboardingAccepted();
      router.replace('/(auth)/sign-in');
    } catch {
      setError('Could not save your preference. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView
        style={{ flex: 1 }}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        contentContainerStyle={{
          padding: theme.spacing.md,
          paddingBottom: theme.spacing.xl,
        }}
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

        <Text variant="title" weight="extrabold" style={{ textAlign: 'center' }}>
          Welcome to WaterMarket
        </Text>
        <Text variant="muted" style={{ marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
          Before you sign in, please review how we handle your information.
        </Text>

        <Card style={{ marginTop: theme.spacing.md }}>
          <Text weight="extrabold" style={{ fontSize: 15, color: theme.colors.primaryDark }}>
            Your privacy matters
          </Text>
          <Text variant="muted" style={{ marginTop: 4, fontSize: 12 }}>
            Last updated: {LEGAL_LAST_UPDATED}
          </Text>

          <View style={{ marginTop: 14, gap: 12 }}>
            {LEGAL_WELCOME_SUMMARY.map((line) => (
              <View key={line} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} style={{ marginTop: 1 }} />
                <Text variant="muted" style={{ flex: 1, lineHeight: 20, fontSize: 14 }}>
                  {line}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <Button
              variant="ghost"
              title="Read Terms"
              onPress={() => router.push('/legal/terms')}
              style={{ flex: 1, minWidth: 120 }}
            />
            <Button
              variant="ghost"
              title="Read Privacy"
              onPress={() => router.push('/legal/privacy')}
              style={{ flex: 1, minWidth: 120 }}
            />
          </View>
        </Card>

        <Card style={{ marginTop: theme.spacing.sm }}>
          <LegalAcceptanceRow checked={accepted} onToggle={() => setAccepted((v) => !v)} />
          {error ? (
            <Text weight="bold" style={{ color: theme.colors.danger, marginTop: 10 }}>
              {error}
            </Text>
          ) : null}
          <View style={{ marginTop: 14 }}>
            <Button
              title={busy ? 'Please wait…' : 'Continue to login'}
              disabled={busy}
              onPress={() => void continueToLogin()}
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
