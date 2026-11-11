import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { theme } from '../theme';

type Props = RNTextProps & {
  variant?: 'title' | 'h1' | 'h2' | 'body' | 'muted' | 'chip';
  weight?: 'regular' | 'semibold' | 'bold' | 'extrabold';
};

export function Text({ variant = 'body', weight, style, ...rest }: Props) {
  const baseStyle = (() => {
    switch (variant) {
      case 'title':
        return { fontSize: 20, color: theme.colors.text };
      case 'h1':
        return { fontSize: 28, color: theme.colors.text };
      case 'h2':
        return { fontSize: 16, color: theme.colors.text };
      case 'muted':
        return { fontSize: 13, color: theme.colors.muted };
      case 'chip':
        return { fontSize: 12, color: theme.colors.text };
      default:
        return { fontSize: 14, color: theme.colors.text };
    }
  })();

  const fontFamily =
    weight === 'extrabold'
      ? theme.font.extrabold
      : weight === 'bold'
        ? theme.font.bold
        : weight === 'semibold'
          ? theme.font.semibold
          : theme.font.regular;

  return <RNText {...rest} style={[baseStyle, { fontFamily }, style]} />;
}

