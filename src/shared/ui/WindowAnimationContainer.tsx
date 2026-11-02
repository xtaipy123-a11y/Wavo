import { useEffect, useState, type ReactNode } from "react";
import { create } from "zustand";

export type WindowAnimationPhase = "idle" | "closing";

interface WindowAnimationStore {
  phase: WindowAnimationPhase;
  triggerMinimize: () => void;
  triggerClose: () => void;
}

export const useWindowAnimationStore = create<WindowAnimationStore>((set, get) => ({
  phase: "idle",
  triggerMinimize: () => {
    // Native instant minimize: zero DOM opacity/scale manipulation.
    // Preserves the DWM taskbar preview thumbnail perfectly and restores with zero grey flash or lag.
    void window.wavoElectron?.minimize?.();
  },
  triggerClose: () => {
    if (get().phase !== "idle") return;

    if (process.env.NODE_ENV === "test") {
      void window.wavoElectron?.close?.();
      return;
    }

    set({ phase: "closing" });
    setTimeout(() => {
      void window.wavoElectron?.close?.();
    }, 120);
  },
}));

export function WindowAnimationContainer({ children }: { children: ReactNode }) {
  const phase = useWindowAnimationStore((s) => s.phase);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const bridge = window.wavoElectron;
    if (!bridge) return;
    let active = true;
    let receivedUpdate = false;
    const unsubscribe = bridge.onWindowStateChange?.((state) => {
      receivedUpdate = true;
      if (active) setIsExpanded(state.isMaximized || state.isFullScreen);
    });
    void Promise.all([bridge.isMaximized?.(), bridge.isFullScreen?.()]).then(([maximized, fullscreen]) => {
      if (active && !receivedUpdate) setIsExpanded(Boolean(maximized || fullscreen));
    }).catch(() => {});
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  let transform = "none";
  let opacity = 1;
  let transition = "none";
  let transformOrigin = "50% 50%";

  if (phase === "closing") {
    transform = "scale(0.94) translateY(8px)";
    opacity = 0;
    transition =
      "transform 120ms cubic-bezier(0.16, 1, 0.3, 1), opacity 110ms cubic-bezier(0.16, 1, 0.3, 1)";
    transformOrigin = "50% 50%";
  }

  return (
    <div
      className="wavo-window h-full w-full transform-gpu"
      data-native-window-frame={window.wavoElectron?.platform === "win32" ? "true" : undefined}
      data-window-expanded={isExpanded ? "true" : undefined}
      style={{
        transform,
        opacity,
        transition,
        transformOrigin,
      }}
    >
      {children}
    </div>
  );
}

export default WindowAnimationContainer;
