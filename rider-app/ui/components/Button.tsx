import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, Pressable, type PressableProps, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { theme } from '../theme';
import { Text } from './Text';

type Variant = 'primary' | 'ghost' | 'danger';

type Props = PressableProps & {
  variant?: Variant;
  title?: string;
  leadingIcon?: ReactNode;
};

export function Button({ variant = 'primary', title, leadingIcon, children, style, disabled, ...rest }: PropsWithChildren<Props>) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const colors = (() => {
    if (variant === 'danger') {
      return { bg: 'rgba(229,72,77,0.12)', border: 'transparent', text: theme.colors.danger };
    }
    if (variant === 'ghost') {
      return {
        bg: theme.colors.card,
        border: theme.colors.primaryDark,
        text: theme.colors.primaryDark,
      };
    }
    return {
      bg: disabled ? '#9CC4F5' : theme.colors.primary,
      border: 'transparent',
      text: theme.colors.onPrimary,
    };
  })();

  const basePressableStyle = {
    borderRadius: 14,
    overflow: 'hidden' as const,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.bg,
    borderWidth: variant === 'ghost' ? 1.5 : 0,
    borderColor: variant === 'ghost' ? colors.border : 'transparent',
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  };

  const wrapperStyle = typeof style === 'function' ? undefined : style;
  const pressableStyle = typeof style === 'function' ? style : undefined;

  return (
    <Animated.View style={[animatedStyle, wrapperStyle]}>
      <Pressable
        {...rest}
        disabled={disabled}
        android_ripple={
          variant === 'primary'
            ? { color: 'rgba(255,255,255,0.22)', borderless: false }
            : variant === 'danger'
              ? { color: 'rgba(229,72,77,0.16)', borderless: false }
              : { color: 'rgba(11,58,150,0.1)', borderless: false }
        }
        onPressIn={(e) => {
          scale.value = withSpring(0.96, { damping: 14, stiffness: 340 });
          rest.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, { damping: 12, stiffness: 260 });
          rest.onPressOut?.(e);
        }}
        style={
          pressableStyle
            ? (state) => [basePressableStyle, pressableStyle(state)]
            : [basePressableStyle, typeof style === 'function' ? undefined : style]
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {leadingIcon}
          {typeof title === 'string' ? (
            <Text
              weight="extrabold"
              numberOfLines={1}
              style={{
                color: colors.text,
                fontSize: 16,
                lineHeight: Platform.OS === 'android' ? 20 : 18,
                textAlign: 'center',
                ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
              }}
            >
              {title}
            </Text>
          ) : null}
          {children}
        </View>
      </Pressable>
    </Animated.View>
  );
}
