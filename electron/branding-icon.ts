import { app } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFile, type ChildProcess } from "node:child_process";

const ICO_HEADER_SIZE = 6;
const ICO_ENTRY_SIZE = 16;

// Windows shell fails to resolve shortcut icon paths when they are wrapped in
// quotes; paths with spaces work fine as long as the trailing index is present.
export function shortcutIconValue(iconPath: string): string {
  return `${iconPath},0`;
}

/**
 * Wraps a 256x256 PNG in a single-entry .ico container. Windows Vista and newer
 * accept PNG-compressed icon entries, which keeps the generated file small.
 */
export function pngToIco(png: Buffer): Buffer {
  const header = Buffer.alloc(ICO_HEADER_SIZE);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(ICO_ENTRY_SIZE);
  entry[0] = 0; // width 256 (0 means 256)
  entry[1] = 0; // height 256
  entry[2] = 0; // palette colors
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(ICO_HEADER_SIZE + ICO_ENTRY_SIZE, 12);

  return Buffer.concat([header, entry, png]);
}

const SHORTCUT_DIRS = `
$dirs = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('Programs'),
  [Environment]::GetFolderPath('CommonPrograms'),
  (Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar')
) | Where-Object { $_ } | Select-Object -Unique
`;

/**
 * Finds Wavo shortcuts once. Scans only the top level of each shell folder:
 * installers place the shortcut directly in the desktop/start-menu root and a
 * recursive scan of the start menu takes several seconds.
 */
const DISCOVER_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
${SHORTCUT_DIRS}
$ws = New-Object -ComObject WScript.Shell
$names = $env:WAVO_APP_EXE_NAMES.Split('|')
$exe = $env:WAVO_TARGET_EXE
foreach ($dir in $dirs) {
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  Get-ChildItem -LiteralPath $dir -Filter *.lnk -File -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $sc = $ws.CreateShortcut($_.FullName)
      $target = $sc.TargetPath
      if (-not $target) { return }
      $targetName = [IO.Path]::GetFileName($target).ToLowerInvariant()
      $samePath = $false
      try {
        $samePath = ([IO.Path]::GetFullPath($target) -ieq [IO.Path]::GetFullPath($exe))
      } catch {}
      if ($samePath -or ($names -contains $targetName)) { Write-Output $_.FullName }
    } catch {}
  }
}
`;

/**
 * Long-lived shortcut worker. Starting PowerShell takes ~150-250ms, which made
 * every branding click feel laggy. The worker keeps the COM object and the
 * shell interop loaded and applies changes in a few milliseconds instead.
 */
const WORKER_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WavoShellNotify {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern void SHChangeNotify(int eventId, uint flags, string item1, IntPtr item2);
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern void SHChangeNotify(int eventId, uint flags, IntPtr item1, IntPtr item2);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindow(string cls, string name);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string name);
  [DllImport("user32.dll")]
  public static extern bool RedrawWindow(IntPtr hWnd, IntPtr rect, IntPtr rgn, uint flags);

  // Explorer keeps the desktop icons in its own list view; invalidating it makes
  // the new icon appear on the next paint instead of waiting for a cache sweep.
  public static void RefreshDesktop() {
    IntPtr view = FindWindowEx(FindWindow("Progman", null), IntPtr.Zero, "SHELLDLL_DefView", null);
    if (view == IntPtr.Zero) {
      IntPtr worker = IntPtr.Zero;
      while ((worker = FindWindowEx(IntPtr.Zero, worker, "WorkerW", null)) != IntPtr.Zero) {
        view = FindWindowEx(worker, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (view != IntPtr.Zero) break;
      }
    }
    IntPtr list = FindWindowEx(view, IntPtr.Zero, "SysListView32", null);
    if (list == IntPtr.Zero) return;
    RedrawWindow(list, IntPtr.Zero, IntPtr.Zero, 0x0001 | 0x0004 | 0x0080 | 0x0100);
  }
}
'@
$ws = New-Object -ComObject WScript.Shell
$utf8 = [Text.Encoding]::UTF8
function Decode([string]$s) { return $utf8.GetString([Convert]::FromBase64String($s)) }
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line -eq 'quit') { break }
  $id = '0'
  try {
    $cmd = $line | ConvertFrom-Json
    $id = [string]$cmd.id
    $icon = Decode $cmd.icon
    $changed = $false
    foreach ($p in $cmd.paths) {
      $lnk = Decode $p
      try {
        $sc = $ws.CreateShortcut($lnk)
        if ($sc.IconLocation -ne $icon) {
          $sc.IconLocation = $icon
          $sc.Save()
          $changed = $true
        }
        # specific item first, then the desktop view is refreshed below
        [WavoShellNotify]::SHChangeNotify(0x00002000, 0x1005, $lnk, [IntPtr]::Zero)
      } catch {}
    }
    if ($changed) {
      # Changing a shortcut icon also changes the shell's icon mapping; a global
      # announcement is what makes Explorer drop its cached bitmap.
      [WavoShellNotify]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
      [WavoShellNotify]::RefreshDesktop()
    }
    [Console]::Out.WriteLine('ok ' + $id)
  } catch {
    [Console]::Out.WriteLine('err ' + $id)
  }
  [Console]::Out.Flush()
}
`;

const encodeArg = (value: string): string => Buffer.from(value, "utf8").toString("base64");

function runPowerShell(script: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        timeout: 20000,
        windowsHide: true,
        env: { ...process.env, ...env },
      },
      (error, stdout) => {
        if (error) {
          console.error("\x1b[41;37m icon \x1b[0m shortcut discovery error:", error.message);
        }
        resolve(stdout ?? "");
      },
    );
  });
}

interface PendingCommand {
  resolve: () => void;
  timeout: NodeJS.Timeout;
}

let worker: ChildProcess | null = null;
let workerReady: Promise<ChildProcess> | null = null;
let workerScriptPath: string | null = null;
let stdoutBuffer = "";
const pendingCommands = new Map<number, PendingCommand>();
let nextCommandId = 1;

function resolvePending(id: number): void {
  const pending = pendingCommands.get(id);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingCommands.delete(id);
  pending.resolve();
}

function failPending(): void {
  for (const [id, pending] of pendingCommands) {
    clearTimeout(pending.timeout);
    pending.resolve();
    pendingCommands.delete(id);
  }
}

function handleWorkerOutput(chunk: string): void {
  stdoutBuffer += chunk;
  let newline = stdoutBuffer.indexOf("\n");
  while (newline >= 0) {
    const line = stdoutBuffer.slice(0, newline).trim();
    stdoutBuffer = stdoutBuffer.slice(newline + 1);
    if (line === "ready") {
      resolvePending(0);
    } else if (line.startsWith("ok ") || line.startsWith("err ")) {
      resolvePending(Number(line.slice(3)));
    }
    newline = stdoutBuffer.indexOf("\n");
  }
}

function disposeWorker(): void {
  const current = worker;
  worker = null;
  workerReady = null;
  stdoutBuffer = "";
  if (current && !current.killed) {
    try {
      current.stdin?.write("quit\n");
      current.kill();
    } catch {
      // already gone
    }
  }
  failPending();
}

async function writeWorkerScript(): Promise<string> {
  if (workerScriptPath) return workerScriptPath;
  const dir = path.join(app.getPath("userData"), "branding");
  await fs.promises.mkdir(dir, { recursive: true });
  const scriptPath = path.join(dir, "shortcut-worker.ps1");
  await fs.promises.writeFile(scriptPath, WORKER_SCRIPT, "utf8");
  workerScriptPath = scriptPath;
  return scriptPath;
}

function startWorker(): Promise<ChildProcess> {
  if (workerReady) return workerReady;

  const ready = (async () => {
    const scriptPath = await writeWorkerScript();
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
    );

    worker = child;
    stdoutBuffer = "";

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => handleWorkerOutput(chunk));
    child.stdin?.on("error", () => {
      if (worker === child) disposeWorker();
    });
    child.on("error", () => {
      if (worker === child) disposeWorker();
    });
    child.on("exit", () => {
      if (worker === child) disposeWorker();
    });

    // The worker prints "ready" once COM interop is loaded (id 0).
    await new Promise<void>((resolve) => {
      const pending: PendingCommand = {
        resolve,
        timeout: setTimeout(() => {
          pendingCommands.delete(0);
          resolve();
        }, 5000),
      };
      pendingCommands.set(0, pending);
    });

    if (worker !== child) throw new Error("shortcut worker exited during startup");
    return child;
  })();

  workerReady = ready;
  ready.catch(() => {
    if (workerReady === ready) workerReady = null;
  });
  return ready;
}

function ensureWorker(): Promise<ChildProcess> {
  return workerReady ?? startWorker();
}

async function sendWorkerCommand(iconValue: string, shortcuts: string[]): Promise<void> {
  const child = await ensureWorker();

  const id = nextCommandId++;
  const payload = JSON.stringify({
    id,
    icon: encodeArg(iconValue),
    paths: shortcuts.map(encodeArg),
  });

  await new Promise<void>((resolve) => {
    const pending: PendingCommand = {
      resolve,
      timeout: setTimeout(() => {
        pendingCommands.delete(id);
        // A hung worker would block every later click; drop it so the next
        // update spawns a fresh one.
        disposeWorker();
        resolve();
      }, 4000),
    };
    pendingCommands.set(id, pending);
    child.stdin?.write(`${payload}\n`);
  });
}

let shortcutPaths: string[] | null = null;
let discovery: Promise<string[]> | null = null;

function getShortcutPaths(): Promise<string[]> {
  if (shortcutPaths && shortcutPaths.length > 0) return Promise.resolve(shortcutPaths);
  if (!discovery) {
    discovery = runPowerShell(DISCOVER_SCRIPT, {
      WAVO_TARGET_EXE: process.execPath,
      WAVO_APP_EXE_NAMES: ["wavo.exe", path.basename(process.execPath).toLowerCase()].join("|"),
    })
      .then((stdout) => {
        shortcutPaths = stdout
          .split(/\r?\n/)
          .map((entry) => entry.trim())
          .filter(Boolean);
        return shortcutPaths;
      })
      .finally(() => {
        discovery = null;
      });
  }
  return discovery;
}

let pendingPng: Buffer | null = null;
let processing: Promise<void> | null = null;

/** Warms shortcut lookup and the PowerShell worker so the first click is instant. */
export function warmBrandingShortcuts(): void {
  if (process.platform !== "win32") return;
  void getShortcutPaths().catch(() => {});
  void startWorker().catch(() => {});
}

/** Stops the background worker when the app quits. */
export function stopBrandingWorker(): void {
  disposeWorker();
}

async function writeAndApply(png: Buffer): Promise<void> {
  const hash = crypto.createHash("sha256").update("v2:").update(png).digest("hex").slice(0, 16);
  const dir = path.join(app.getPath("userData"), "branding");
  await fs.promises.mkdir(dir, { recursive: true });

  const iconPath = path.join(dir, `wavo-${hash}.ico`);
  if (!fs.existsSync(iconPath)) {
    await fs.promises.writeFile(iconPath, pngToIco(png));
  }

  const paths = await getShortcutPaths();
  if (paths.length === 0) return;

  // Never delete older icon files: shortcuts updated on another profile (or
  // before a permissions failure) may still reference them.
  await sendWorkerCommand(shortcutIconValue(iconPath), paths);
}

async function drainPending(): Promise<void> {
  try {
    while (pendingPng) {
      const png = pendingPng;
      pendingPng = null;
      try {
        await writeAndApply(png);
      } catch (err) {
        console.error("\x1b[41;37m icon \x1b[0m branding icon error:", err);
      }
    }
  } finally {
    processing = null;
    // an icon arrived while the last write was finishing
    if (pendingPng) void applyBrandingIcon(pendingPng);
  }
}

/**
 * Persists a branding icon as .ico and points the desktop/start-menu shortcuts
 * at it. No-op outside Windows. Rapid changes coalesce to the latest icon so
 * clicking through variants cannot build up a queue of shell updates.
 */
export function applyBrandingIcon(png: Buffer): Promise<void> {
  if (process.platform !== "win32" || png.length === 0) return Promise.resolve();

  pendingPng = png;
  if (!processing) processing = drainPending();
  return processing;
}
