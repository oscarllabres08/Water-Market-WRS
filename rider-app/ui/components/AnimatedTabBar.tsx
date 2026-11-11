import { useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../theme';
import { Text } from './Text';

type TabDef = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
};

const INACTIVE_COLOR = theme.colors.muted;
const INACTIVE_LABEL = theme.colors.tabInactiveLabel;
const ROW_HEIGHT = 54;
const PILL_INSET = 6;

const TABS: TabDef[] = [
  { key: 'orders', label: 'Orders', icon: 'list-outline', iconActive: 'list' },
  { key: 'delivery', label: 'Delivery', icon: 'navigate-outline', iconActive: 'navigate' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

/** Left → right tab order (Profile last = rightmost). */
const TAB_ROUTE_ORDER = ['orders', 'delivery', 'profile'] as const;

function normalizeRouteName(name: string) {
  return name.replace(/\/index$/, '');
}

function tabLabel(routeName: string, options: BottomTabBarProps['descriptors'][string]['options']) {
  const tb = options?.tabBarLabel;
  if (typeof tb === 'string' && tb.trim()) return tb;
  if (typeof options?.title === 'string' && options.title.trim()) return options.title;
  const key = normalizeRouteName(routeName);
  const fromTabs = TABS.find((t) => t.key === key)?.label;
  return fromTabs ?? key;
}

function TabButton({
  label,
  iconName,
  iconActiveName,
  isFocused,
  onPress,
}: {
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconActiveName: keyof typeof Ionicons.glyphMap;
  isFocused: boolean;
  onPress: () => void;
}) {
  const focus = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focus.value = withSpring(isFocused ? 1 : 0, { damping: 14, stiffness: 240, mass: 0.55 });
  }, [isFocused, focus]);

  const iconAnim = useAnimatedStyle(() => ({
    transform: [{ scale: 0.92 + focus.value * 0.12 }],
  }));

  const resolvedIcon = isFocused ? iconActiveName : iconName;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: ROW_HEIGHT,
        gap: 2,
      }}
    >
      <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, iconAnim]}>
        <Ionicons
          name={resolvedIcon}
          size={22}
          color={isFocused ? theme.colors.primary : INACTIVE_COLOR}
        />
      </Animated.View>
      <Text
        variant="chip"
        weight={isFocused ? 'extrabold' : 'semibold'}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        style={{
          color: isFocused ? theme.colors.primary : INACTIVE_LABEL,
          textAlign: 'center',
          width: '100%',
          paddingHorizontal: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AnimatedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const orderedRoutes = useMemo(() => {
    const order = [...TAB_ROUTE_ORDER];
    return [...state.routes]
      .filter((r) => order.includes(normalizeRouteName(r.name) as (typeof order)[number]))
      .sort((a, b) => {
        const ia = order.indexOf(normalizeRouteName(a.name) as (typeof order)[number]);
        const ib = order.indexOf(normalizeRouteName(b.name) as (typeof order)[number]);
        return ia - ib;
      });
  }, [state.routes]);

  const activeKey = state.routes[state.index]?.key;
  const trackWidth = useSharedValue(0);
  const active = useSharedValue(0);
  const tabCount = useSharedValue(Math.max(orderedRoutes.length, 1));

  useEffect(() => {
    tabCount.value = Math.max(orderedRoutes.length, 1);
    const slot = orderedRoutes.findIndex((route) => route.key === activeKey);
    active.value = withSpring(slot < 0 ? 0 : slot, { damping: 16, stiffness: 210, mass: 0.65 });
  }, [active, activeKey, orderedRoutes, tabCount]);

  const indicatorStyle = useAnimatedStyle(() => {
    const count = Math.max(tabCount.value, 1);
    const tabW = trackWidth.value / count;
    return {
      width: Math.max(tabW - PILL_INSET * 2, 0),
      opacity: trackWidth.value > 0 ? 1 : 0,
      transform: [{ translateX: active.value * tabW + PILL_INSET }],
    };
  });

  return (
    <View
      style={{
        backgroundColor: theme.colors.tabBar,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingHorizontal: 4,
        paddingTop: 8,
        paddingBottom: 8 + Math.max(insets.bottom, 0),
      }}
    >
      <View
        onLayout={(e) => {
          trackWidth.value = e.nativeEvent.layout.width;
        }}
        style={{ flexDirection: 'row', height: ROW_HEIGHT, alignItems: 'center' }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              height: ROW_HEIGHT,
              borderRadius: 16,
              backgroundColor: 'rgba(0,116,240,0.12)',
            },
            indicatorStyle,
          ]}
        />
        {orderedRoutes.map((route) => {
          const options = descriptors[route.key]?.options;
          const label = tabLabel(route.name, options);
          const isFocused = route.key === activeKey;

          const def =
            TABS.find((t) => t.key === normalizeRouteName(route.name)) ??
            TABS.find((t) => route.name === `${t.key}/index` || route.name.startsWith(`${t.key}/`));
          const iconName = def?.icon ?? 'ellipse-outline';
          const iconActiveName = def?.iconActive ?? iconName;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };

          return (
            <TabButton
              key={route.key}
              label={label}
              iconName={iconName}
              iconActiveName={iconActiveName}
              isFocused={isFocused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

