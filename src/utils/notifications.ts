import { NotificationLogItem } from '../types';

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestPushNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return Notification.permission;
  }
}

export function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Two-tone harmonic observatory chime (A5 -> E6)
    const freqs = [880, 1318.51];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);

      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.48);
    });
  } catch {
    // AudioContext may be blocked if no user gesture yet
  }
}

export async function dispatchBackgroundPushNotification(
  notif: NotificationLogItem,
  options: { soundEnabled: boolean; vibrateEnabled: boolean; onClickUrl?: (url: string) => void }
) {
  if (options.soundEnabled) {
    playNotificationChime();
  }

  if (options.vibrateEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([180, 80, 220]);
    } catch {
      // Ignore on unsupported devices
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const title = `[아스트로마트 ${notif.category}] 새 게시물 도착`;
  const body = `${notif.title} · 작성자: ${notif.author}${
    notif.matchedKeyword ? ` (키워드: ${notif.matchedKeyword})` : ''
  }`;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: `astromart-post-${notif.uid}`,
          renotify: true,
          data: { url: notif.url, uid: notif.uid },
        } as NotificationOptions);
        return;
      }
    }

    const browserNotif = new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      tag: `astromart-post-${notif.uid}`,
    });
    browserNotif.onclick = () => {
      window.focus();
      if (options.onClickUrl) {
        options.onClickUrl(notif.url);
      }
      browserNotif.close();
    };
  } catch {
    // Fallback if notification fails
  }
}

export function updateAppBadge(unreadCount: number) {
  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    try {
      if (unreadCount > 0) {
        (navigator as unknown as { setAppBadge: (n: number) => Promise<void> }).setAppBadge(unreadCount);
      } else {
        (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge();
      }
    } catch {
      // Ignore
    }
  }
}
