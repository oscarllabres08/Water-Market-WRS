import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { NOTIF_CHANNEL_SILENT, NOTIF_CHANNEL_SOUND, notificationContentSound } from './notificationChannels';

// Bundled copy of the repo-root notification.wav (web playback).
const notificationWav = require('../assets/notification.wav') as string | { uri?: string };

let webAudio: HTMLAudioElement | null = null;

function webSoundUri() {
  if (typeof notificationWav === 'string') return notificationWav;
  return notificationWav?.uri ?? '';
}

const shownIds = new Set<string>();

function remember(id: string) {
  shownIds.add(id);
  setTimeout(() => shownIds.delete(id), 20000);
}

/** FCM already showed this row, so the in-app listener must not post a second one. */
export function noteRemoteNotification(id: string | undefined) {
  const key = String(id ?? '').trim();
  if (!key || shownIds.has(key)) return;
  remember(key);
}

function playWeb() {
  if (typeof Audio === 'undefined') return;
  const uri = webSoundUri();
  if (!uri) return;
  try {
    if (!webAudio) {
      webAudio = new Audio(uri);
      webAudio.preload = 'auto';
    }
    webAudio.currentTime = 0;
    void webAudio.play().catch(() => {
      /* Browser may block autoplay until a tap */
    });
  } catch {
    /* ignore */
  }
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    () => {
      const uri = webSoundUri();
      if (!uri || typeof Audio === 'undefined') return;
      const audio = webAudio ?? new Audio(uri);
      webAudio = audio;
      audio.muted = true;
      void audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      }).catch(() => {});
    },
    { once: true },
  );
}

type PhoneAlert = { id?: string; title?: string; body?: string; sound?: boolean };

/**
 * Web plays notification.wav.
 * On the phone, posts a real notification on the sound channel so the shade
 * and the ringtone both fire when a row arrives in the app.
 */
export function playNotificationSound(alert?: PhoneAlert) {
  if (Platform.OS === 'web') {
    playWeb();
    return;
  }

  const title = alert?.title?.trim();
  if (!title) return;
  const id = String(alert?.id ?? '').trim();
  if (id && shownIds.has(id)) return;
  if (id) remember(id);

  const soundOn = alert?.sound !== false;
  void Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: alert?.body?.trim() || '',
      sound: notificationContentSound(soundOn),
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { localAlert: '1', notificationId: id },
    },
    trigger: { channelId: soundOn ? NOTIF_CHANNEL_SOUND : NOTIF_CHANNEL_SILENT },
  }).catch(() => {});
}
