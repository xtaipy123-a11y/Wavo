import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, Root } from "react-dom/client";
import { useThemeCustomizationSync } from "./useThemeCustomizationSync";
import { useCustomizationStore } from "../store/customizationStore";

const mockSetTheme = vi.fn();
let mockTheme = "light";
let mockResolvedTheme = "light";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: mockTheme,
    resolvedTheme: mockResolvedTheme,
    setTheme: mockSetTheme,
  }),
}));

function Harness() {
  useThemeCustomizationSync();
  return null;
}

describe("useThemeCustomizationSync", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    useCustomizationStore.getState().resetAll();
    mockTheme = "light";
    mockResolvedTheme = "light";
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      document.body.removeChild(container);
    }
    root = null;
    container = null;
    document.body.innerHTML = "";
  });

  function mount() {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(<Harness />);
    });
  }

  it("keeps light appearance selectable by making wallpaper blocks opaque", () => {
    useCustomizationStore.getState().setBackgroundImage("data:image/png;base64,mock");
    mount();

    const state = useCustomizationStore.getState();
    expect(state.sidebar).toMatchObject({ opacity: 100, blur: 0 });
    expect(state.contentView).toMatchObject({ opacity: 100, blur: 0 });
    expect(state.miniplayer).toMatchObject({ opacity: 100, blur: 0 });
    expect(mockSetTheme).not.toHaveBeenCalled();
  });

  it("does not force dark theme when there is no custom wallpaper", () => {
    mockTheme = "light";
    mockResolvedTheme = "light";
    mount();

    expect(mockSetTheme).not.toHaveBeenCalled();
  });

  it("preserves glass when dark appearance is active", () => {
    mockTheme = "dark";
    mockResolvedTheme = "dark";
    useCustomizationStore.getState().setBackgroundImage("data:image/png;base64,mock");
    mount();

    expect(useCustomizationStore.getState().contentView.opacity).toBe(60);
    expect(mockSetTheme).not.toHaveBeenCalled();
  });
});
