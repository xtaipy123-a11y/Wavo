import { useEffect, useState } from "react";
import Dialog from "@/shared/ui/Dialog";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import type { UpdateInfo } from "@/../electron/preload";

const SHOWN_VERSION_KEY = "wavo:last-shown-changelog-version";

function readableNotes(notes?: string): string {
  if (!notes) return "";
  const raw = /<[a-z][\s\S]*>/i.test(notes)
    ? new DOMParser().parseFromString(notes.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<\/li>/gi, "\n"), "text/html").body.textContent ?? ""
    : notes;
  return raw.replace(/^#{1,6}\s+[^\n]+\n+/, "").trim();
}

export default function PostUpdateChangelog() {
  const { locale } = useTranslation();
  const de = locale === "de";
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let active = true;
    void window.wavoElectron?.getPostUpdateInfo?.().then((result) => {
      if (active && result?.version && localStorage.getItem(SHOWN_VERSION_KEY) !== result.version) {
        setInfo(result);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const close = () => {
    if (info) localStorage.setItem(SHOWN_VERSION_KEY, info.version);
    setInfo(null);
  };

  return (
    <Dialog open={Boolean(info)} onOpenChange={(open) => { if (!open) close(); }} maxWidth={520}>
      <div role="dialog" aria-modal="true" aria-labelledby="post-update-title" className="flex min-h-0 flex-col gap-[12px] px-[22px] pb-[22px] text-text-primary">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">Wavo</span>
        <h2 id="post-update-title" className="m-0 text-[23px] font-bold">{de ? "Wavo wurde aktualisiert" : "Wavo has been updated"}</h2>
        <p className="m-0 text-[13px] text-text-secondary">{de ? `Version ${info?.version ?? ""} ist jetzt installiert.` : `Version ${info?.version ?? ""} is now installed.`}</p>
        <div className="min-h-0 max-h-[45vh] overflow-y-auto rounded-[12px] border border-border-alpha-15 bg-bg-secondary/70 px-[16px] py-[14px]">
          <h3 className="m-0 mb-[8px] text-[13px] font-semibold">{de ? "Was ist neu?" : "What's new?"}</h3>
          <p className="m-0 whitespace-pre-wrap text-[13px] leading-[1.6] text-text-secondary">
            {readableNotes(info?.releaseNotes) || (de ? "Für dieses Update wurden keine Details veröffentlicht." : "No release notes were published for this update.")}
          </p>
        </div>
        <Button variant="primary" onClick={close} className="self-end px-[22px]">
          {de ? "Weiterhören" : "Continue listening"}
        </Button>
      </div>
    </Dialog>
  );
}
