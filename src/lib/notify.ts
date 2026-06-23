import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export async function notify(title: string, body?: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === 'granted';
    }
    if (granted) sendNotification({ title, body });
  } catch {
    // Notification unavailable (e.g. missing permission at OS level) — silently ignore
  }
}
