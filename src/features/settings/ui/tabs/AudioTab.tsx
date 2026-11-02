import { useState, useEffect } from "react";
import { FolderOpenLine } from "@mingcute/react";
import { useToast } from "@/shared/ui";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import { usePlayerStore, type AudioQuality } from "@/features/player";
import { Select, ToggleSwitch } from "@/shared/ui";
import { useConnectivityStore } from "@/features/connectivity";
import { SettingRow, SettingSection } from "../controls";
import { useAutomaticDownloadStore } from "@/features/downloads/automaticDownloads";

export function AudioTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();
  const [dumpExported, setDumpExported] = useState(false);
  const audioQuality = usePlayerStore((state) => state.audioQuality);
  const setAudioQuality = usePlayerStore((state) => state.setAudioQuality);
  const autoFavorites = useAutomaticDownloadStore((state) => state.favorites);
  const autoPlaylists = useAutomaticDownloadStore((state) => state.playlists);
  const setAutoDownload = useAutomaticDownloadStore((state) => state.setEnabled);
  const connRunning = useConnectivityStore((s) => s.running);
  const connChecks = useConnectivityStore((s) => s.checks);
  const connLastRunAt = useConnectivityStore((s) => s.lastRunAt);
  const runAndSaveDump = useConnectivityStore((s) => s.runAndSaveDump);

  useEffect(() => {
    setMounted(true);
  }, []);

  // lossless is listed as unavailable, so the picker only offers live tiers
  const quality: Exclude<AudioQuality, "lossless"> =
    audioQuality === "lossless" ? "high" : audioQuality;

  return (
    <div className="flex flex-col gap-[16px]">
      <SettingSection>
        <SettingRow
          title={t("settings.audio.title")}
          description={t("settings.audio.description")}
          titleKey="settings.audio.title"
          descKey="settings.audio.description"
          searchQuery={searchQuery}
          control={
            mounted ? (
              <Select
                aria-label={t("settings.audio.title")}
                className="w-[210px]"
                value={quality}
                onChange={setAudioQuality}
                options={[
                  { value: "low", label: t("settings.audio.low") },
                  { value: "standard", label: t("settings.audio.standard") },
                  { value: "high", label: t("settings.audio.high") },
                ]}
              />
            ) : (
              <span />
            )
          }
        />
      </SettingSection>

      <SettingSection label={t("settings.offline_downloads.title")}>
        <SettingRow
          title={t("settings.offline_downloads.favorites")}
          description={t("settings.offline_downloads.favorites_description")}
          titleKey="settings.offline_downloads.favorites"
          descKey="settings.offline_downloads.favorites_description"
          searchQuery={searchQuery}
          control={<ToggleSwitch checked={autoFavorites} onChange={(enabled) => setAutoDownload("favorites", enabled)} ariaLabel={t("settings.offline_downloads.favorites")} />}
        />
        <SettingRow
          title={t("settings.offline_downloads.playlists")}
          description={t("settings.offline_downloads.playlists_description")}
          titleKey="settings.offline_downloads.playlists"
          descKey="settings.offline_downloads.playlists_description"
          searchQuery={searchQuery}
          control={<ToggleSwitch checked={autoPlaylists} onChange={(enabled) => setAutoDownload("playlists", enabled)} ariaLabel={t("settings.offline_downloads.playlists")} />}
        />
      </SettingSection>

      <SettingSection label={t("settings.connection.title")}>
        <SettingRow
          title={t("settings.connection.checks_title")}
          titleKey="settings.connection.checks_title"
          searchQuery={searchQuery}
          description={
            connChecks.length > 0 && connLastRunAt
              ? t("settings.connection.last_run", {
                  ok: connChecks.filter((c) => c.status === "ok").length,
                  total: connChecks.length,
                  time: new Date(connLastRunAt).toLocaleTimeString(),
                })
              : t("settings.connection.never_run")
          }
          control={
            <div className="flex items-center gap-[8px]">
              {dumpExported && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={async () => {
                    const targetPath = useConnectivityStore.getState().lastSavedDumpPath || undefined;
                    if (window.wavoElectron?.openExportFolder) {
                      await window.wavoElectron.openExportFolder(targetPath);
                    } else if (window.wavoElectron?.openDownloads) {
                      await window.wavoElectron.openDownloads(targetPath);
                    } else {
                      toast(t("settings.connection.open_folder"), "info");
                    }
                  }}
                  title={t("settings.connection.open_folder")}
                  aria-label={t("settings.connection.open_folder")}
                  className="!h-[34px] !w-[34px] !px-0"
                >
                  <FolderOpenLine size={18} />
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={connRunning}
                onClick={async () => {
                  const res = await runAndSaveDump();
                  if (res.success) {
                    setDumpExported(true);
                    toast(t("settings.connection.saved"), "success");
                  } else if (!res.canceled) {
                    toast(t("settings.connection.failed"), "error");
                  }
                }}
              >
                {connRunning
                  ? t("settings.connection.checking")
                  : t("settings.connection.button")}
              </Button>
            </div>
          }
        />
      </SettingSection>
    </div>
  );
}
