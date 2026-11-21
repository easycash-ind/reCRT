import { create } from 'zustand';

export type HubDisplayMode = 'light' | 'dark';

const STORAGE_KEY = 'hub.display-theme';

function readStoredDisplayMode(): HubDisplayMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'dark' || raw === 'light') {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return 'light';
}

export function applyHubDisplayModeToDom(mode: HubDisplayMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.hubTheme = mode;
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode === 'dark' ? 'dark' : 'light';
}

const initialDisplayMode = readStoredDisplayMode();
applyHubDisplayModeToDom(initialDisplayMode);

interface HubThemeStore {
  displayMode: HubDisplayMode;
  setDisplayMode: (mode: HubDisplayMode) => void;
  toggleDisplayMode: () => void;
}

export const useHubThemeStore = create<HubThemeStore>((set) => ({
  displayMode: initialDisplayMode,
  setDisplayMode: (mode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
    applyHubDisplayModeToDom(mode);
    set({ displayMode: mode });
  },
  toggleDisplayMode: () => {
    set((state) => {
      const next: HubDisplayMode = state.displayMode === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore storage errors
      }
      applyHubDisplayModeToDom(next);
      return { displayMode: next };
    });
  },
}));
