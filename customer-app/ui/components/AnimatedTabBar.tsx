import { useEffect } from 'react';
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
  { key: 'index', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { key: 'order', label: 'Order', icon: 'water-outline', iconActive: 'water' },
  { key: 'rewards', label: 'Vouchers', icon: 'ticket-outline', iconActive: 'ticket' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

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
    transform: [{ scale: 0.92 + focus.value * 0.12 }, { translateY: focus.value * -1 }],
  }));

  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: ROW_HEIGHT, gap: 2 }}>
      <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, iconAnim]}>
        <Ionicons
          name={isFocused ? iconActiveName : iconName}
          size={21}
          color={isFocused ? theme.colors.primary : INACTIVE_COLOR}
        />
      </Animated.View>
      <Text
        variant="chip"
        weight={isFocused ? 'semibold' : 'regular'}
        numberOfLines={1}
        style={{
          color: isFocused ? theme.colors.primary : INACTIVE_LABEL,
          textAlign: 'center',
          width: '100%',
          paddingHorizontal: 2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AnimatedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const trackWidth = useSharedValue(0);
  const active = useSharedValue(state.index);
  const tabCount = useSharedValue(state.routes.length);

  useEffect(() => {
    tabCount.value = state.routes.length;
    active.value = withSpring(state.index, { damping: 18, stiffness: 190, mass: 0.7 });
  }, [active, state.index, state.routes.length, tabCount]);

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
        paddingHorizontal: 6,
        paddingTop: 6,
        paddingBottom: 6 + Math.max(insets.bottom, 0),
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
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options;
          const label =
            options?.tabBarLabel?.toString() ??
            (typeof options?.title === 'string' ? options.title : undefined) ??
            route.name;
          const isFocused = state.index === index;
          const def = TABS.find((t) => t.key === route.name);

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name as never);
          };

          return (
            <TabButton
              key={route.key}
              label={label}
              iconName={def?.icon ?? 'ellipse-outline'}
              iconActiveName={def?.iconActive ?? def?.icon ?? 'ellipse'}
              isFocused={isFocused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}
