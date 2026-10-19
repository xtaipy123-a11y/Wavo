import Dialog from "@/shared/ui/Dialog";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import { useUpdaterStore } from "../store/updaterStore";

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

export default function UpdateModal() {
  const { t } = useTranslation();
  const isDialogOpen = useUpdaterStore((state) => state.isDialogOpen);
  const updateInfo = useUpdaterStore((state) => state.updateInfo);
  const skipUpdate = useUpdaterStore((state) => state.skipUpdate);
  const startDownload = useUpdaterStore((state) => state.startDownload);

  if (!updateInfo) return null;

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        if (!open) skipUpdate();
      }}
      maxWidth={360}
    >
      <div className="flex flex-col gap-[16px] px-[20px] pb-[20px]">
        {/* Title & Description with Notion-style blue link */}
        <div className="flex flex-col gap-[6px]">
          <h3
            className="text-text-primary text-[16px] font-[600] tracking-[-0.01em] m-0"
            style={font}
          >
            {t("updater.modal_title") || "New Update Available"}
          </h3>
          <p
            className="text-text-secondary text-[13px] leading-relaxed m-0 font-[400]"
            style={font}
          >
            {t("updater.modal_desc", { version: updateInfo.version }) ||
              `A new version of Wavo (v${updateInfo.version}) is ready.`}
          </p>
        </div>

        {/* 1-row Action Buttons */}
        <div className="flex items-center gap-[8px] w-full pt-[4px]">
          <Button
            variant="secondary"
            onClick={skipUpdate}
            className="flex-1 !h-[36px] !text-[13px]"
          >
            {t("updater.skip_button") || "Skip"}
          </Button>
          <Button
            variant="primary"
            onClick={() => void startDownload()}
            className="flex-1 !h-[36px] !text-[13px]"
          >
            {t("updater.update_button") || "Update"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
