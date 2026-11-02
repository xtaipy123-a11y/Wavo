import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const useDiscordSettingsStore = create<{
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}>()(persist((set) => ({
  enabled: true,
  setEnabled: (enabled) => set({ enabled }),
}), {
  name: "wavo_discord_settings_v1",
  storage: createJSONStorage(() => localStorage),
  partialize: ({ enabled }) => ({ enabled }),
}));
