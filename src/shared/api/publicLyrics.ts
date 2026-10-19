import type { LyricsStreamEvent } from "../contracts";
import { streamAmllLyrics } from "./amll";
import { streamLrclibLyrics, type LyricsHint } from "./lrclib";

export async function* streamPublicLyrics(
  hint?: LyricsHint,
  signal?: AbortSignal,
): AsyncGenerator<LyricsStreamEvent> {
  let best: Extract<LyricsStreamEvent, { type: "provider"; status: "found" }> | null = null;
  for (const [name, source] of [
    ["amll", streamAmllLyrics],
    ["lrclib", streamLrclibLyrics],
  ] as const) {
    try {
      for await (const event of source(hint, signal)) {
        if (event.type === "done") continue;
        if (event.type === "provider" && event.status === "found") {
          if (!best || (event.syncLevel === "word_level" && best.syncLevel !== "word_level")) {
            best = event;
          }
        }
        yield event;
      }
    } catch (error) {
      if (signal?.aborted) return;
      yield {
        type: "provider",
        provider: name,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  yield {
    type: "done",
    cached: false,
    ...(best ? { best: { provider: best.provider, quality: best.candidate.quality.total, syncLevel: best.syncLevel } } : { status: "not_found" }),
  };
}
