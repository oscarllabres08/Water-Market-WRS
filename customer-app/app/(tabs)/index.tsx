import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';
import { NotificationsMenu } from '../../ui/components/NotificationsMenu';
import { useNotifications } from '../../providers/NotificationsProvider';

const heroImage = require('../../assets/store.png');

const features: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  tint: string;
  ink: string;
}[] = [
  {
    icon: 'shield-checkmark-outline',
    title: 'Purified water',
    subtitle: 'Filtered and ready to drink.',
    tint: 'rgba(0,116,240,0.12)',
    ink: '#0074F0',
  },
  {
    icon: 'bicycle-outline',
    title: 'Fast delivery',
    subtitle: 'Brought to your door.',
    tint: 'rgba(0,183,245,0.16)',
    ink: '#0094C8',
  },
  {
    icon: 'pricetag-outline',
    title: 'Fair prices',
    subtitle: 'Good water, honest rates.',
    tint: 'rgba(47,184,74,0.14)',
    ink: '#1F9A3A',
  },
  {
    icon: 'home-outline',
    title: 'Home & office',
    subtitle: 'Refills where you need them.',
    tint: 'rgba(11,58,150,0.10)',
    ink: '#0B3A96',
  },
];

const steps = [
  { step: '1', title: 'Choose a product', subtitle: 'Pick the water you need.' },
  { step: '2', title: 'Add quantity & details', subtitle: 'Set the address and contact.' },
  { step: '3', title: 'Checkout', subtitle: 'Review, then confirm the order.' },
  { step: '4', title: 'Track your order', subtitle: 'We will keep you updated.' },
];

const services: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  ink: string;
  tint: string;
}[] = [
  {
    icon: 'water-outline',
    title: 'Water refilling',
    subtitle: 'Purified drinking water for everyday use.',
    ink: '#0074F0',
    tint: 'rgba(0,116,240,0.12)',
  },
  {
    icon: 'home-outline',
    title: 'Home & office delivery',
    subtitle: 'Dropped off safely at your door.',
    ink: '#0B3A96',
    tint: 'rgba(11,58,150,0.10)',
  },
  {
    icon: 'checkmark-circle-outline',
    title: 'Clean & safe',
    subtitle: 'Checked so every refill stays reliable.',
    ink: '#1F9A3A',
    tint: 'rgba(47,184,74,0.14)',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const openOrder = () => router.push('/(tabs)/order');

  return (
    <Screen style={{ padding: 0 }} enter>
      <NotificationsMenu visible={notifOpen} onClose={() => setNotifOpen(false)} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingTop: 10, paddingBottom: theme.spacing.xl, gap: 14 }}>
        <View
          style={{
            width: '100%',
            aspectRatio: 16 / 9,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: theme.colors.navyDeep,
          }}
        >
          <Image
            source={heroImage}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            accessibilityLabel="WaterMarket store"
          />
          <Pressable
            onPress={() => setNotifOpen(true)}
            accessibilityLabel="Notifications"
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#06215F',
              shadowOpacity: 0.28,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 6,
            }}
          >
            <Ionicons name="notifications" size={22} color={theme.colors.primaryDark} />
            {unreadCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  minWidth: 16,
                  height: 16,
                  paddingHorizontal: 3,
                  borderRadius: 8,
                  backgroundColor: theme.colors.danger,
                  borderWidth: 1.5,
                  borderColor: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text weight="bold" style={{ color: '#fff', fontSize: 9 }}>
                  {unreadCount > 99 ? '99+' : String(unreadCount)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <Card style={{ gap: 8 }}>
          <Text weight="semibold" style={{ color: theme.colors.accent, fontSize: 13 }}>
            Doorstep water refilling
          </Text>
          <Text weight="bold" style={{ color: theme.colors.navyDeep, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 }}>
            Pure water, delivered to you
          </Text>
          <Text weight="regular" style={{ color: theme.colors.muted, fontSize: 14, lineHeight: 20 }}>
            Safe, clean, and refreshing refills for home and office.
          </Text>
          <View style={{ marginTop: 6 }}>
            <Button title="Order now" onPress={openOrder} />
          </View>
        </Card>

        <Card>
          <Text weight="bold" style={{ color: theme.colors.primaryDark, fontSize: 18 }}>
            Why WaterMarket
          </Text>
          <Text weight="regular" style={{ color: theme.colors.muted, marginTop: 3, lineHeight: 18 }}>
            Tap a highlight to start an order.
          </Text>
          <View style={{ marginTop: 12, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <MiniFeature {...features[0]} onPress={openOrder} />
              <MiniFeature {...features[1]} onPress={openOrder} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <MiniFeature {...features[2]} onPress={openOrder} />
              <MiniFeature {...features[3]} onPress={openOrder} />
            </View>
          </View>
        </Card>

        <Card>
          <Text weight="bold" style={{ color: theme.colors.primaryDark, fontSize: 18 }}>
            How it works
          </Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {steps.map((item) => (
              <HowRow key={item.step} {...item} />
            ))}
          </View>
          <View style={{ marginTop: 14 }}>
            <Button title="Start your order" onPress={openOrder} />
          </View>
        </Card>

        <Card>
          <Text weight="bold" style={{ color: theme.colors.primaryDark, fontSize: 18 }}>
            Our services
          </Text>
          <View style={{ marginTop: 8 }}>
            {services.map((item, index) => (
              <View key={item.title}>
                {index > 0 ? <View style={{ height: 8 }} /> : null}
                <ServiceRow {...item} onPress={openOrder} />
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function MiniFeature({
  icon,
  title,
  subtitle,
  tint,
  ink,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  tint: string;
  ink: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[{ flex: 1 }, anim]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.96, { damping: 16, stiffness: 320 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 14, stiffness: 260 });
        }}
        style={{
          borderRadius: 16,
          padding: 12,
          backgroundColor: tint,
          alignItems: 'flex-start',
          gap: 6,
          minHeight: 132,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={18} color={ink} />
        </View>
        <Text weight="semibold" style={{ color: theme.colors.navyDeep, fontSize: 14 }} numberOfLines={2}>
          {title}
        </Text>
        <Text weight="regular" style={{ color: theme.colors.muted, fontSize: 12, lineHeight: 16 }} numberOfLines={3}>
          {subtitle}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function HowRow({ step, title, subtitle }: { step: string; title: string; subtitle: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: 'rgba(0,183,245,0.16)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text weight="semibold" style={{ color: theme.colors.primaryDark, fontSize: 14 }}>
          {step}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text weight="semibold" style={{ color: theme.colors.navyDeep, fontSize: 15 }}>
          {title}
        </Text>
        <Text weight="regular" style={{ color: theme.colors.muted, marginTop: 1, fontSize: 13 }}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function ServiceRow({
  icon,
  title,
  subtitle,
  ink,
  tint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  ink: string;
  tint: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={anim}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.98, { damping: 16, stiffness: 320 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 14, stiffness: 260 });
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 10,
          paddingHorizontal: 10,
          borderRadius: 14,
          backgroundColor: tint,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={18} color={ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text weight="semibold" style={{ color: theme.colors.navyDeep, fontSize: 15 }}>
            {title}
          </Text>
          <Text weight="regular" style={{ color: theme.colors.muted, marginTop: 1, fontSize: 13 }}>
            {subtitle}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={ink} />
      </Pressable>
    </Animated.View>
  );
}
