import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudSync, restoreLocalProfile } from "./cloudSync";
import { getAuthSession } from "@/shared/api";
import { getStoredLocale } from "@/languages/locale";

vi.mock("@/shared/api", () => ({ getAuthSession: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(getAuthSession).mockReturnValue({ user: { id: "user-a" }, accessToken: "token" } as ReturnType<typeof getAuthSession>);
});

describe("offline cloud journal", () => {
  it("uses English when switching to an account without a saved language", () => {
    const languages = vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"]);
    try {
      localStorage.setItem("wavo_locale", "de");
      restoreLocalProfile("new-account");
      expect(getStoredLocale()).toBe("en");
    } finally { languages.mockRestore(); }
  });

  it("keeps an account's saved language when restoring its profile", () => {
    localStorage.setItem("wavo_local_profile_user-a", JSON.stringify({ settings: { locale: "de" } }));
    restoreLocalProfile("user-a");
    expect(getStoredLocale()).toBe("de");
  });

  it("keeps the latest mutation and a deletion tombstone for one item", () => {
    const sync = new CloudSync("user-a");
    sync.enqueue({ kind: "like", id: "track-1", payload: { liked: true }, deleted: false });
    sync.enqueue({ kind: "like", id: "track-1", payload: {}, deleted: true });
    const journal = JSON.parse(localStorage.getItem("wavo_cloud_journal_user-a")!);
    expect(Object.keys(journal.pending)).toEqual(["like:track-1"]);
    expect(journal.pending["like:track-1"]).toMatchObject({ deleted: true, payload: {} });
    sync.stop();
  });

  it("does not mix changes between signed-in users", () => {
    const sync = new CloudSync("user-a");
    vi.mocked(getAuthSession).mockReturnValue({ user: { id: "user-b" }, accessToken: "token" } as ReturnType<typeof getAuthSession>);
    sync.enqueue({ kind: "like", id: "track-1", payload: {}, deleted: false });
    expect(localStorage.getItem("wavo_cloud_journal_user-a")).toBeNull();
    sync.stop();
  });

  it("runs another pass when a change arrives during an active sync", async () => {
    const sync = new CloudSync("user-a");
    let finishPull: () => void = () => {};
    const waiting = new Promise<void>((resolve) => { finishPull = resolve; });
    vi.spyOn(sync as any, "pull")
      .mockImplementationOnce(async () => { await waiting; return new Set(); })
      .mockResolvedValue(new Set());
    vi.spyOn(sync as any, "bootstrap").mockResolvedValue(undefined);
    const flush = vi.spyOn(sync as any, "flush").mockResolvedValue(undefined);
    const first = sync.sync();
    await sync.sync();
    finishPull();
    await first;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(flush).toHaveBeenCalledTimes(2);
    sync.stop();
  });
});
