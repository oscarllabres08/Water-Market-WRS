import type { PropsWithChildren } from 'react';
import { View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { theme } from '../theme';

type ScreenProps = PropsWithChildren<
  ViewProps & {
    backgroundColor?: string;
    safeAreaEdges?: Edge[];
  }
>;

export function Screen({ children, style, backgroundColor, safeAreaEdges, ...rest }: ScreenProps) {
  const edges = safeAreaEdges ?? (['top', 'left', 'right'] as Edge[]);
  const frame = (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <View
        {...rest}
        style={[
          {
            flex: 1,
            width: '100%',
            maxWidth: 720,
            padding: theme.spacing.md,
          },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: backgroundColor ?? theme.colors.bg }}>
      {backgroundColor ? (
        frame
      ) : (
      <LinearGradient
        colors={[theme.colors.bgSoft, theme.colors.bg, theme.colors.bgTint]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      >
        {frame}
      </LinearGradient>
      )}
    </SafeAreaView>
  );
}
