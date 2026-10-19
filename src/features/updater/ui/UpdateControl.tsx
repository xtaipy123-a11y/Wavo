import { Refresh1Line } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { APP_VERSION } from "@/shared/config/version";
import { useToast } from "@/shared/ui";
import { useUpdaterStore } from "../store/updaterStore";

export default function UpdateControl() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const status = useUpdaterStore((state) => state.status);
  const progress = useUpdaterStore((state) => state.downloadProgress);
  const checkForUpdates = useUpdaterStore((state) => state.checkForUpdates);
  const openDialog = useUpdaterStore((state) => state.openDialog);
  const installUpdate = useUpdaterStore((state) => state.installUpdate);

  const busy = status === "checking" || status === "downloading";
  const label = status === "downloaded"
    ? t("updater.install_button")
    : status === "downloading"
      ? `${Math.round(progress?.percent ?? 0)}%`
      : status === "checking"
        ? t("settings.about.checking_updates")
        : status === "available"
          ? t("updater.update_button")
          : t("settings.about.check_updates");

  const handleClick = async () => {
    if (status === "downloaded") {
      await installUpdate();
      return;
    }
    if (status === "available") {
      openDialog();
      return;
    }
    if (busy) return;

    await checkForUpdates();
    if (useUpdaterStore.getState().status === "idle") {
      toast(t("settings.about.latest_version_toast", { version: APP_VERSION }), "info");
    }
  };

  return (
    <button
      type="button"
      data-no-window-drag
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={() => void handleClick()}
      className={`absolute top-[18px] right-[116px] z-[80] inline-flex h-[32px] items-center gap-[7px] rounded-lg border border-border-primary/40 bg-bg-panel/90 px-[11px] text-[12px] font-medium text-text-primary shadow-sm backdrop-blur-xl transition-colors hover:bg-bg-elevated disabled:cursor-default disabled:opacity-70 ${status === "downloaded" ? "ring-1 ring-emerald-400/60" : ""}`}
    >
      <Refresh1Line size={15} className={busy ? "animate-spin" : ""} />
      <span>{label}</span>
    </button>
  );
}
