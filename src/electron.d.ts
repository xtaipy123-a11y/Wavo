import type { WavoElectronApi } from "../electron/preload";

declare global {
  interface Window {
    wavoElectron?: WavoElectronApi;
  }
}

export {};
