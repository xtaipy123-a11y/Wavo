// signs outgoing api requests with canonical headers: x-wavo-signature, timestamp, nonce
export interface SignedHeaders {
  "x-wavo-signature"?: string;
  "x-wavo-timestamp"?: string;
  "x-wavo-nonce"?: string;
}

// maintains clock delta between client and server (ms)
let serverTimeOffsetMs = 0;

// parses date header from server response and calculates clock delta
export function syncServerTime(dateHeaderOrMs: string | number | Date): number {
  const serverMs =
    typeof dateHeaderOrMs === "number"
      ? dateHeaderOrMs
      : typeof dateHeaderOrMs === "string"
        ? Date.parse(dateHeaderOrMs)
        : dateHeaderOrMs.getTime();

  if (!Number.isNaN(serverMs) && serverMs > 0) {
    serverTimeOffsetMs = serverMs - Date.now();
    // notify electron main process to sync its native signer clock
    if (typeof window !== "undefined" && window.wavoElectron?.syncServerTime) {
      window.wavoElectron.syncServerTime(serverMs).catch(() => {});
    }
  }
  return serverTimeOffsetMs;
}

export function getServerTimeOffset(): number {
  return serverTimeOffsetMs;
}

export function getAdjustedTimestamp(): number {
  return Math.floor((Date.now() + serverTimeOffsetMs) / 1000);
}

function isElectron(): boolean {
  return typeof window !== "undefined" && typeof window.wavoElectron?.signRequest === "function";
}

export async function signApiRequest(
  method: string,
  path: string,
  body?: string | null,
  customTimestamp?: number,
): Promise<SignedHeaders> {
  if (!isElectron()) {
    if (import.meta.env.DEV) {
      console.warn(
        "[Signer] Not running in Electron environment (window.wavoElectron is undefined). Outgoing requests will NOT have HMAC headers.",
      );
    }
    return {};
  }

  const cleanPath = path.split("?")[0].trim();
  const timestamp = customTimestamp ?? getAdjustedTimestamp();

  try {
    const res = await window.wavoElectron!.signRequest({
      method: method.toUpperCase().trim(),
      path: cleanPath,
      body: body ?? undefined,
      timestamp,
    });

    if (res && res.error) {
      console.error("[Signer] Native signer error:", res.error);
    } else if (res && res.signature) {
      return {
        "x-wavo-signature": res.signature,
        "x-wavo-timestamp": String(res.timestamp ?? timestamp),
        "x-wavo-nonce": res.nonce,
      };
    }
  } catch (err) {
    console.error("[Signer] IPC signRequest call failed:", err);
  }

  return {};
}
