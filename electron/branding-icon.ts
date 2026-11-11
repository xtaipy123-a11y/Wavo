import { app } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

const ICO_HEADER_SIZE = 6;
const ICO_ENTRY_SIZE = 16;

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

const SHORTCUT_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$ws = New-Object -ComObject WScript.Shell
$dirs = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('Programs'),
  [Environment]::GetFolderPath('CommonPrograms')
) | Where-Object { $_ } | Select-Object -Unique
foreach ($dir in $dirs) {
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  Get-ChildItem -LiteralPath $dir -Filter *.lnk -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $sc = $ws.CreateShortcut($_.FullName)
      $target = $sc.TargetPath
      if (-not $target) { return }
      $targetName = [IO.Path]::GetFileName($target).ToLowerInvariant()
      $samePath = $false
      try {
        $samePath = ([IO.Path]::GetFullPath($target) -ieq [IO.Path]::GetFullPath($env:WAVO_TARGET_EXE))
      } catch {}
      if ($samePath -or $env:WAVO_APP_EXE_NAMES.Split('|') -contains $targetName) {
        if ($sc.IconLocation -ne $env:WAVO_ICON_VALUE) {
          $sc.IconLocation = $env:WAVO_ICON_VALUE
          $sc.Save()
        }
      }
    } catch {}
  }
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WavoShellNotify {
  [DllImport("shell32.dll")]
  public static extern void SHChangeNotify(int eventId, uint flags, IntPtr item1, IntPtr item2);
}
'@
[WavoShellNotify]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
`;

function updateWindowsShortcuts(iconPath: string): Promise<void> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SHORTCUT_SCRIPT],
      {
        timeout: 20000,
        windowsHide: true,
        env: {
          ...process.env,
          WAVO_ICON_VALUE: `"${iconPath}",0`,
          WAVO_TARGET_EXE: process.execPath,
          WAVO_APP_EXE_NAMES: ["wavo.exe", path.basename(process.execPath).toLowerCase()].join("|"),
        },
      },
      (error) => {
        if (error) {
          console.error("\x1b[41;37m icon \x1b[0m shortcut update error:", error.message);
        }
        resolve();
      },
    );
  });
}

let queue: Promise<void> = Promise.resolve();

/**
 * Persists a branding icon as .ico and points the desktop/start-menu shortcuts
 * at it. No-op outside Windows.
 */
export function applyBrandingIcon(png: Buffer): Promise<void> {
  if (process.platform !== "win32" || png.length === 0) return Promise.resolve();

  const hash = crypto.createHash("sha256").update(png).digest("hex").slice(0, 16);
  const run = queue.catch(() => {}).then(async () => {
    const dir = path.join(app.getPath("userData"), "branding");
    await fs.promises.mkdir(dir, { recursive: true });

    const iconPath = path.join(dir, `wavo-${hash}.ico`);
    if (!fs.existsSync(iconPath)) {
      await fs.promises.writeFile(iconPath, pngToIco(png));
    }

    await updateWindowsShortcuts(iconPath);

    // best effort: drop icons from previous variants once nothing points at them
    try {
      for (const entry of await fs.promises.readdir(dir)) {
        if (entry.endsWith(".ico") && entry !== path.basename(iconPath)) {
          await fs.promises.rm(path.join(dir, entry), { force: true }).catch(() => {});
        }
      }
    } catch {
      // never block the icon sync on cleanup
    }
  });

  queue = run.catch(() => {});
  return run;
}
