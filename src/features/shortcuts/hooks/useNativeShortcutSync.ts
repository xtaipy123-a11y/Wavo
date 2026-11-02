import { useEffect } from "react";
import { useShortcutsStore } from "../store/shortcutsStore";

export function useNativeShortcutSync() {
  useEffect(() => {
    const bridge = window.wavoElectron;
    if (!bridge?.configureShortcuts) return;
    let active = true;
    let revision = 0;
    let previous: unknown[] = [];
    const sync = () => {
      const { global, mainApp, miniplayer, activationScopes } = useShortcutsStore.getState();
      const current = [global, mainApp, miniplayer, activationScopes];
      if (current.every((value, index) => value === previous[index])) return;
      previous = current;
      const request = ++revision;
      void bridge.configureShortcuts!({ global, mainApp, miniplayer, activationScopes }).then((result) => {
        if (active && request === revision && !bridge.onShortcutRegistration) useShortcutsStore.getState().setNativeRegistration(result);
      }).catch(() => {
        if (active && request === revision) useShortcutsStore.getState().setNativeRegistration({ registered: [], failed: {} });
      });
    };
    const unsubscribeStatus = bridge.onShortcutRegistration?.((result) => {
      if (active) useShortcutsStore.getState().setNativeRegistration(result);
    });
    const unsubscribe = useShortcutsStore.subscribe(sync);
    sync();
    return () => {
      active = false;
      unsubscribe();
      unsubscribeStatus?.();
      bridge.clearShortcuts?.();
    };
  }, []);
}
