import { useEffect, useRef } from "react";
import { levaStore } from "leva";
import { fetchSceneConfig, saveSceneConfig } from "../services/configApi";

function extractValues(): Record<string, unknown> {
  const data = levaStore.getData();
  const result: Record<string, unknown> = {};
  for (const [path, item] of Object.entries(data)) {
    if (item && "value" in item) {
      result[path] = (item as { value: unknown }).value;
    }
  }
  return result;
}

/**
 * Call once at the app root.
 *
 * - On mount: polls until leva controls are registered, then loads
 *   saved config from the backend and injects via levaStore.set().
 * - After load: polls every 500ms, compares a JSON snapshot of all
 *   values, and saves to backend only when something actually changed.
 *   This sidesteps zustand subscribe compatibility issues.
 */
export function useConfigPersistence() {
  const lastSnapshot = useRef<string>("");
  const loaded = useRef(false);

  // Phase 1: load from backend once leva controls exist
  useEffect(() => {
    let cancelled = false;

    const waitAndLoad = async () => {
      // Wait for all leva controls to register.
      // Keep waiting until the control count stabilises for 500ms.
      let prevCount = 0;
      let stableMs = 0;
      while (!cancelled) {
        const count = Object.keys(levaStore.getData()).length;
        if (count > 0 && count === prevCount) {
          stableMs += 100;
          if (stableMs >= 500) break;
        } else {
          stableMs = 0;
        }
        prevCount = count;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (cancelled) return;

      const saved = await fetchSceneConfig();
      if (cancelled) return;

      if (saved && Object.keys(saved).length > 0) {
        levaStore.set(saved as Record<string, unknown>, false);
      }

      // Take initial snapshot so we don't immediately re-save defaults
      lastSnapshot.current = JSON.stringify(extractValues());
      loaded.current = true;
    };

    waitAndLoad();
    return () => { cancelled = true; };
  }, []);

  // Phase 2: poll for changes and save
  useEffect(() => {
    const interval = setInterval(() => {
      if (!loaded.current) return;

      const current = JSON.stringify(extractValues());
      if (current !== lastSnapshot.current) {
        lastSnapshot.current = current;
        saveSceneConfig(extractValues());
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);
}
