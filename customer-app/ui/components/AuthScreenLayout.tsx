import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Screen } from './Screen';
import { Text } from './Text';
import { theme } from '../theme';

type AuthScreenLayoutProps = PropsWithChildren<{
  logo: ImageSourcePropType;
  kicker: string;
  brand: string;
  tagline: string;
  highlights: string[];
  title: string;
  subtitle: string;
  footer?: ReactNode;
}>;

/** Branded login/register: navy hero plus a form card that still scrolls above the keyboard. */
export function AuthScreenLayout({
  logo,
  kicker,
  brand,
  tagline,
  highlights,
  title,
  subtitle,
  children,
  footer,
}: AuthScreenLayoutProps) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardOpen(true);
      setKeyboardInset(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardOpen(false);
      setKeyboardInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const logoSize = keyboardOpen ? { width: 88, height: 88 } : { width: 148, height: 148 };

  return (
    <Screen style={{ padding: 0 }} backgroundColor="#0B3A96">
      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          scrollEnabled
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: Math.max(theme.spacing.xl, keyboardInset + 16),
          }}
        >
          <LinearGradient
            colors={['#0E4ED8', '#0B3A96', '#06215F']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{
              paddingHorizontal: 20,
              paddingTop: keyboardOpen ? 8 : 12,
              paddingBottom: keyboardOpen ? 28 : 36,
              borderBottomLeftRadius: 28,
              borderBottomRightRadius: 28,
              overflow: 'hidden',
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: 180,
                height: 180,
                borderRadius: 90,
                backgroundColor: 'rgba(0,183,245,0.28)',
                top: -50,
                right: -40,
              }}
            />
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 22,
                  paddingVertical: keyboardOpen ? 6 : 8,
                  paddingHorizontal: keyboardOpen ? 8 : 10,
                }}
              >
                <Image
                  source={logo}
                  style={logoSize}
                  resizeMode="contain"
                  accessibilityLabel="WaterMarket"
                  accessibilityIgnoresInvertColors
                />
              </View>
              <Text
                weight="extrabold"
                style={{
                  marginTop: keyboardOpen ? 8 : 14,
                  color: '#B8E8FF',
                  fontSize: 11,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                }}
              >
                {kicker}
              </Text>
              <Text weight="extrabold" style={{ marginTop: 4, color: '#FFFFFF', fontSize: keyboardOpen ? 22 : 28 }}>
                {brand}
              </Text>
              {keyboardOpen ? null : (
                <Text style={{ marginTop: 6, color: 'rgba(255,255,255,0.82)', textAlign: 'center', lineHeight: 20, fontSize: 14 }}>
                  {tagline}
                </Text>
              )}
            </View>
            {keyboardOpen ? null : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                {highlights.map((item) => (
                  <View
                    key={item}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: 'rgba(255,255,255,0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.22)',
                    }}
                  >
                    <Text weight="bold" style={{ color: '#FFFFFF', fontSize: 12 }}>
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </LinearGradient>

          <View
            style={{
              marginTop: -18,
              marginHorizontal: 14,
              backgroundColor: '#FFFFFF',
              borderRadius: 22,
              padding: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              ...theme.shadow.card,
            }}
          >
            <Text variant="title" weight="extrabold" style={{ color: theme.colors.navyDeep }}>
              {title}
            </Text>
            <Text variant="muted" style={{ marginTop: 4, lineHeight: 20 }}>
              {subtitle}
            </Text>
            <View style={{ marginTop: 14, gap: theme.spacing.sm }}>{children}</View>
            {footer ? <View style={{ marginTop: 12 }}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
