import { Linking, Platform } from 'react-native';

export function dialablePhone(raw: string) {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export async function openPhoneDialer(raw: string) {
  const tel = dialablePhone(raw);
  if (!tel) throw new Error('invalid');
  const url = `tel:${tel}`;
  try {
    await Linking.openURL(url);
    return;
  } catch {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = url;
      return;
    }
    throw new Error('open');
  }
}