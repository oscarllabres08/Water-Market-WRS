import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Repo-root `notification.wav` is bundled as Android res/raw/notification.wav
 * and as iOS `notification.wav` by the expo-notifications config plugin.
 */
export const NOTIF_SOUND_RAW = 'notification';

/** Bump when replacing notification.wav so Android creates a fresh channel sound. */
export const NOTIF_CHANNEL_SOUND = 'wrs_alerts_v4';
export const NOTIF_CHANNEL_SILENT = 'wrs_silent_v1';

const LEGACY_CHANNEL_IDS = ['silent', 'wrs_alerts_v3'];

export function notificationContentSound(soundOn: boolean): string | undefined {
  if (!soundOn) return undefined;
  return Platform.OS === 'ios' ? 'notification.wav' : NOTIF_SOUND_RAW;
}

export async function ensureAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  for (const id of LEGACY_CHANNEL_IDS) {
    try {
      await Notifications.deleteNotificationChannelAsync(id);
    } catch {
      /* channel may not exist */
    }
  }

  await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL_SOUND, {
    name: 'Order alerts (sound)',
    description: 'Alerts with the WaterMarket notification sound',
    importance: Notifications.AndroidImportance.MAX,
    sound: NOTIF_SOUND_RAW,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0B3A96',
    showBadge: true,
  });

  await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL_SILENT, {
    name: 'Order alerts (silent)',
    description: 'Alerts without sound',
    importance: Notifications.AndroidImportance.HIGH,
    sound: null,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0B3A96',
    showBadge: true,
  });
}
