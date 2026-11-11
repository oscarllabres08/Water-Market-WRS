import { Platform } from 'react-native';

/** WaterMarket — sampled from the logo (royal blue, water cyan, leaf green). */
const shadowInk = '#06215F';

const shadowCard = Platform.select({
  android: {
    shadowColor: shadowInk,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  default: {
    shadowColor: shadowInk,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
});

export const theme = {
  colors: {
    bg: '#F3F8FC',
    bgSoft: '#F7FBFE',
    bgTint: '#D7F0FB',
    card: '#FFFFFF',
    text: '#07142E',
    muted: '#5A7090',
    border: '#C5E6F6',
    primary: '#0074F0',
    primaryDark: '#0B3A96',
    navyDeep: '#06215F',
    accent: '#00B7F5',
    accentBright: '#00A8F0',
    danger: '#E5484D',
    warning: '#F59E0B',
    success: '#2FB84A',
    successBright: '#3CC24A',
    tabBar: '#FFFFFF',
    tabInactiveLabel: 'rgba(7, 20, 46, 0.72)',
    onPrimary: '#FFFFFF',
  },
  radius: {
    lg: 16,
    xl: 22,
    pill: 999,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
  },
  shadow: {
    card: shadowCard,
    ink: shadowInk,
  },
  font: {
    regular: 'Nunito_400Regular',
    semibold: 'Nunito_600SemiBold',
    bold: 'Nunito_700Bold',
    extrabold: 'Nunito_800ExtraBold',
  },
  /** Primary buttons — cyan → blue like logo lettering */
  gradient: {
    primary: ['#00B7F5', '#0074F0'] as const,
  },
} as const;
