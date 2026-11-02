import { describe, expect, it, vi } from "vitest";
import { createGlobalShortcutRegistry } from "./global-shortcuts";
import { DEFAULT_SHORTCUTS, type ShortcutsSettings } from "../src/features/shortcuts/types";

function settings(overrides: Partial<ShortcutsSettings> = {}): ShortcutsSettings {
  return {
    global: { ...DEFAULT_SHORTCUTS.global },
    mainApp: { ...DEFAULT_SHORTCUTS.mainApp, playPause: "Control+Alt+P" },
    miniplayer: { ...DEFAULT_SHORTCUTS.miniplayer },
    activationScopes: { "mainApp-playPause": "global" },
    ...overrides,
  };
}

function harness() {
  const api = { register: vi.fn((_key: string, _callback: () => void) => true), unregister: vi.fn() };
  const trigger = vi.fn();
  return { api, trigger, registry: createGlobalShortcutRegistry(api, trigger) };
}

describe("native shortcut registry", () => {
  it("registers selected global actions and forwards each press once", () => {
    const { api, registry, trigger } = harness();
    expect(registry.configure(settings())).toEqual({ registered: ["mainApp-playPause"], failed: {} });
    expect(api.register).toHaveBeenCalledOnce();
    api.register.mock.calls[0][1]();
    expect(trigger).toHaveBeenCalledExactlyOnceWith("mainApp-playPause");
  });

  it("does not register app-only actions or take over legacy overlay registrations", () => {
    const { api, registry } = harness();
    registry.configure(settings({ activationScopes: {} }));
    expect(api.register).not.toHaveBeenCalled();
    expect(api.unregister).not.toHaveBeenCalled();
  });

  it("releases its own global binding when the action becomes app-only", () => {
    const { api, registry } = harness();
    registry.configure(settings());
    registry.configure(settings({ activationScopes: { "mainApp-playPause": "app" } }));
    expect(api.unregister).toHaveBeenCalledExactlyOnceWith("Control+Alt+P");
    expect(api.unregister).not.toHaveBeenCalledWith(DEFAULT_SHORTCUTS.global.toggleOverlay);
  });

  it("pauses recording, accepts edits while paused, and resumes with the latest binding", () => {
    const { api, registry } = harness();
    registry.configure(settings());
    registry.pause(true);
    registry.configure(settings({ mainApp: { ...DEFAULT_SHORTCUTS.mainApp, playPause: "Control+Alt+J" } }));
    expect(api.register).toHaveBeenCalledTimes(1);
    registry.pause(false);
    expect(api.register.mock.lastCall?.[0]).toBe("Control+Alt+J");
  });

  it("rejects bare keys and duplicate global bindings", () => {
    const { api, registry } = harness();
    const result = registry.configure(settings({
      mainApp: { ...DEFAULT_SHORTCUTS.mainApp, nextTrack: DEFAULT_SHORTCUTS.global.toggleOverlay },
      activationScopes: { "mainApp-playPause": "global", "mainApp-nextTrack": "global" },
    }));
    expect(result.failed).toEqual({ "mainApp-playPause": "invalid", "mainApp-nextTrack": "conflict" });
    expect(api.register).not.toHaveBeenCalled();
  });

  it("reports OS conflicts and invalid accelerators without leaving registrations behind", () => {
    const { api, registry } = harness();
    api.register.mockReturnValueOnce(false);
    expect(registry.configure(settings()).failed).toEqual({ "mainApp-playPause": "unavailable" });
    api.register.mockImplementationOnce(() => { throw new Error("bad accelerator"); });
    expect(registry.configure(settings()).failed).toEqual({ "mainApp-playPause": "invalid" });
    registry.destroy();
    expect(api.unregister).not.toHaveBeenCalled();
  });

  it("supports overlay actions globally and cleans up on shutdown", () => {
    const { api, registry } = harness();
    registry.configure(settings({
      miniplayer: { ...DEFAULT_SHORTCUTS.miniplayer, likeTrack: "Control+Alt+L" },
      activationScopes: { "miniplayer-likeTrack": "global" },
    }));
    registry.destroy();
    expect(api.unregister).toHaveBeenCalledExactlyOnceWith("Control+Alt+L");
  });
});
