import { DEFAULT_SHORTCUTS, getShortcutActivationScope, type ShortcutsSettings, type ShortcutRegistrationResult } from "../src/features/shortcuts/types";

export interface ShortcutApi {
  register: (accelerator: string, callback: () => void) => boolean;
  unregister: (accelerator: string) => void;
}

export function createGlobalShortcutRegistry(api: ShortcutApi, onTrigger: (id: string) => void) {
  const owned = new Map<string, string>();
  let settings: ShortcutsSettings | null = null;
  let paused = false;

  const clear = () => {
    for (const accelerator of owned.values()) api.unregister(accelerator);
    owned.clear();
  };

  const apply = (): ShortcutRegistrationResult => {
    clear();
    const result: ShortcutRegistrationResult = { registered: [], failed: {} };
    if (!settings || paused) return result;
    const used = new Set<string>();
    for (const scope of ["global", "mainApp", "miniplayer"] as const) {
      for (const action of Object.keys(DEFAULT_SHORTCUTS[scope])) {
        if (getShortcutActivationScope(settings, scope, action) !== "global") continue;
        const id = `${scope}-${action}`;
        const accelerator = Object.fromEntries(Object.entries(settings[scope] ?? {}))[action];
        if (typeof accelerator !== "string" || accelerator.length > 80 ||
          !(/(?:^|\+)(?:Control|Ctrl|Alt|Shift|Command|Cmd|Meta|CommandOrControl)(?:\+|$)/i.test(accelerator) || /^F\d{1,2}$/i.test(accelerator))) {
          result.failed[id] = "invalid";
          continue;
        }
        const normalized = accelerator.toLowerCase();
        if (used.has(normalized)) {
          result.failed[id] = "conflict";
          continue;
        }
        used.add(normalized);
        // OverlayManager owns these two registrations.
        if (scope === "global") continue;
        try {
          if (api.register(accelerator, () => onTrigger(id))) {
            owned.set(id, accelerator);
            result.registered.push(id);
          } else {
            result.failed[id] = "unavailable";
          }
        } catch {
          result.failed[id] = "invalid";
        }
      }
    }
    return result;
  };

  return {
    configure(next: ShortcutsSettings) { settings = next; return apply(); },
    pause(value: boolean) { paused = value; return apply(); },
    destroy() { settings = null; clear(); },
  };
}
