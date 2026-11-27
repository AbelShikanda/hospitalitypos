import { registerSW } from 'virtual:pwa-register';
import {
  canApplyUpdate,
  parseReleaseNotes,
  type ReleaseNotes,
} from './updates-core.js';

export type UpdateState = {
  needRefresh: boolean;
  offlineReady: boolean;
  checking: boolean;
  billOpen: boolean;
  error: string;
  releaseNotes: ReleaseNotes | null;
};

const listeners = new Set<(state: UpdateState) => void>();
let state: UpdateState = {
  needRefresh: false,
  offlineReady: false,
  checking: false,
  billOpen: false,
  error: '',
  releaseNotes: null,
};
let updateServiceWorker: ((reload?: boolean) => Promise<void>) | null = null;
let started = false;
let stopPolling: (() => void) | null = null;

function publish(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

async function loadReleaseNotes() {
  try {
    const response = await fetch(`changelog.json?ts=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!response.ok) return;
    const notes = parseReleaseNotes(await response.json());
    if (notes) publish({ releaseNotes: notes });
  } catch {
    return;
  }
}

export function getUpdateState(): UpdateState {
  return state;
}

export function subscribeToUpdates(listener: (state: UpdateState) => void) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function setBillOpen(open: boolean) {
  if (state.billOpen !== open) publish({ billOpen: open });
}

export function startUpdateRegistration(): () => void {
  if (started || !('serviceWorker' in navigator)) return () => undefined;
  started = true;
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      publish({ needRefresh: true, checking: false, error: '' });
      void loadReleaseNotes();
    },
    onOfflineReady() {
      publish({ offlineReady: true, checking: false });
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (document.visibilityState === 'visible') void checkForUpdates();
      };
      const timer = window.setInterval(check, 60 * 60 * 1000);
      window.addEventListener('focus', check);
      stopPolling = () => {
        window.clearInterval(timer);
        window.removeEventListener('focus', check);
      };
    },
    onRegisterError(error) {
      publish({
        checking: false,
        error: error instanceof Error ? error.message : 'Update check failed.',
      });
    },
  });
  return () => {
    stopPolling?.();
    stopPolling = null;
    started = false;
  };
}

export async function checkForUpdates(): Promise<
  'checked' | 'unsupported' | 'error'
> {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  publish({ checking: true, error: '' });
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      publish({ checking: false });
      return 'unsupported';
    }
    await registration.update();
    publish({ checking: false });
    return 'checked';
  } catch {
    publish({ checking: false, error: 'Could not check for updates.' });
    return 'error';
  }
}

export async function applyUpdate(): Promise<boolean> {
  if (!updateServiceWorker) return false;
  if (!canApplyUpdate(state.billOpen, state.needRefresh)) {
    if (state.billOpen) {
      publish({ error: 'Finish the open bill before reloading.' });
    }
    return false;
  }
  publish({ checking: true, error: '' });
  await updateServiceWorker(true);
  return true;
}
