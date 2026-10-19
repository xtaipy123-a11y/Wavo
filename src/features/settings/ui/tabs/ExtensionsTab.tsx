import { useRef } from "react";
import { ToggleSwitch, useToast } from "@/shared/ui";
import { useTranslation } from "@/languages";
import { builtInThemes, useExtensionsStore } from "@/features/extensions";
import { SettingBlock, SettingRow, SettingSection } from "../controls";

export function ExtensionsTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedTheme = useExtensionsStore((state) => state.selectedTheme);
  const installedThemes = useExtensionsStore((state) => state.installedThemes);
  const compactRows = useExtensionsStore((state) => state.compactRows);
  const roundCovers = useExtensionsStore((state) => state.roundCovers);
  const ambientGlow = useExtensionsStore((state) => state.ambientGlow);
  const setSelectedTheme = useExtensionsStore((state) => state.setSelectedTheme);
  const setCompactRows = useExtensionsStore((state) => state.setCompactRows);
  const setRoundCovers = useExtensionsStore((state) => state.setRoundCovers);
  const setAmbientGlow = useExtensionsStore((state) => state.setAmbientGlow);
  const installTheme = useExtensionsStore((state) => state.installTheme);
  const removeTheme = useExtensionsStore((state) => state.removeTheme);

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 32 * 1024) throw new Error("Theme file is too large");
      installTheme(JSON.parse(await file.text()));
      toast(t("settings.extensions.installed"), "success");
    } catch {
      toast(t("settings.extensions.invalid_file"), "error");
    }
  };

  return (
    <div className="flex flex-col gap-[16px]">
      <SettingSection label={t("settings.extensions.themes_title")}>
        <SettingBlock
          title={t("settings.extensions.themes_title")}
          description={t("settings.extensions.themes_description")}
          titleKey="settings.extensions.themes_title"
          descKey="settings.extensions.themes_description"
          searchQuery={searchQuery}
        >
          <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-3">
            {[...builtInThemes, ...installedThemes].map((theme) => (
              <div key={theme.id} className="relative">
                <button
                  type="button"
                  onClick={() => setSelectedTheme(theme.id)}
                  aria-pressed={selectedTheme === theme.id}
                  className={`flex w-full flex-col gap-2 rounded-xl border p-2 text-left cursor-pointer transition-colors ${selectedTheme === theme.id ? "border-accent-primary bg-border-alpha-14" : "border-border-primary bg-bg-panel hover:bg-bg-elevated"}`}
                >
                  <span className="flex h-[40px] w-full items-center gap-1 rounded-md px-2" style={{ background: theme.dark.background }}>
                    <span className="h-5 w-5 rounded-full" style={{ background: theme.dark.accent }} />
                    <span className="h-4 w-6 rounded" style={{ background: theme.dark.elevated }} />
                    <span className="h-2 w-10 rounded" style={{ background: theme.dark.text, opacity: 0.8 }} />
                  </span>
                  <span className="text-[12px] font-medium text-text-primary truncate">{theme.name}</span>
                </button>
                {installedThemes.some((pack) => pack.id === theme.id) && (
                  <button
                    type="button"
                    onClick={() => removeTheme(theme.id)}
                    aria-label={`${t("settings.extensions.remove_theme")}: ${theme.name}`}
                    title={t("settings.extensions.remove_theme")}
                    className="absolute right-3 bottom-2 rounded px-1 text-text-secondary hover:text-text-primary bg-bg-elevated cursor-pointer"
                  >×</button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                void onFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button type="button" onClick={() => fileInput.current?.click()} className="rounded-lg bg-border-alpha-14 px-3 py-2 text-[12px] text-text-primary hover:bg-bg-panel cursor-pointer">
              {t("settings.extensions.install_theme")}
            </button>
            <span className="text-[11px] text-text-tertiary">{t("settings.extensions.json_hint")}</span>
          </div>
        </SettingBlock>
      </SettingSection>

      <SettingSection label={t("settings.extensions.modules_title")}>
        <SettingRow title={t("settings.extensions.compact_rows")} description={t("settings.extensions.compact_rows_desc")} titleKey="settings.extensions.compact_rows" descKey="settings.extensions.compact_rows_desc" searchQuery={searchQuery} control={<ToggleSwitch checked={compactRows} onChange={setCompactRows} />} />
        <SettingRow title={t("settings.extensions.round_covers")} description={t("settings.extensions.round_covers_desc")} titleKey="settings.extensions.round_covers" descKey="settings.extensions.round_covers_desc" searchQuery={searchQuery} control={<ToggleSwitch checked={roundCovers} onChange={setRoundCovers} />} />
        <SettingRow title={t("settings.extensions.ambient_glow")} description={t("settings.extensions.ambient_glow_desc")} titleKey="settings.extensions.ambient_glow" descKey="settings.extensions.ambient_glow_desc" searchQuery={searchQuery} control={<ToggleSwitch checked={ambientGlow} onChange={setAmbientGlow} />} />
      </SettingSection>
    </div>
  );
}
