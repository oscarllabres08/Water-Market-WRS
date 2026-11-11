import type { PropsWithChildren } from 'react';
import { View, type ViewProps } from 'react-native';
import { theme } from '../theme';

export function Card({ style, children, ...rest }: PropsWithChildren<ViewProps>) {
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.xl,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
          ...theme.shadow.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

