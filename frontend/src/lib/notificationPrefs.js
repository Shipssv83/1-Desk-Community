// Operator notification preferences, stored per-browser in localStorage.
// Shared by Profile (settings UI) and NotificationCenter (consumer). Changing a
// pref dispatches a window event so an already-mounted NotificationCenter picks
// it up without a reload.

const STORAGE_KEY = 'onedesk_notif_prefs';
export const NOTIF_PREFS_EVENT = 'onedesk:notif-prefs-changed';

const DEFAULTS = {
  enabled: true, // master switch
  sound: true,
  desktop: true,
  tabCounter: true,
  toast: true
};

export function getNotificationPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setNotificationPrefs(prefs) {
  const merged = { ...getNotificationPrefs(), ...prefs };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent(NOTIF_PREFS_EVENT, { detail: merged }));
  } catch {
    // ignore storage failures (private mode, etc.)
  }
  return merged;
}
