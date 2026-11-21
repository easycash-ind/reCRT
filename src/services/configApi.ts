const STORAGE_KEY = "recrt:leva-scene-config";

export async function fetchSceneConfig(): Promise<Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.warn("Failed to load scene config from localStorage");
    return {};
  }
}

export async function saveSceneConfig(data: Record<string, unknown>): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    console.warn("Failed to save scene config to localStorage");
  }
}