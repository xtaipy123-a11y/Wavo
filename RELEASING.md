# Wavo mit GitHub verbinden und Updates veröffentlichen

Der Ordner `D:\Wavo` ist als Git-Repository eingerichtet. `origin` zeigt auf `https://github.com/xtaipy123-a11y/Wavo.git`. Das öffentliche Repository enthält derzeit nur eine Lizenzdatei; Wavo-Quellcode und GitHub Releases wurden noch nicht hochgeladen.

## Erste Veröffentlichung

1. Die Änderungen in `D:\Wavo` prüfen. `.env.local`, `node_modules`, Build-Ausgaben und Installer werden durch `.gitignore` ausgeschlossen.
2. Den vorbereiteten `main`-Branch zu GitHub hochladen: `git push -u origin main`. Git fragt gegebenenfalls nach deiner GitHub-Anmeldung.
3. In GitHub unter **Settings → Actions → General → Workflow permissions** sicherstellen, dass der Release-Workflow Releases erstellen darf. Der Workflow deklariert `contents: write`.
4. Der Tag `v0.1.43` ist lokal bereits gesetzt. Mit `git push origin v0.1.43` startet der erste Release-Workflow.
5. Unter **Actions** den Windows-Workflow abwarten. Danach unter **Releases** prüfen, ob `Wavo-Setup-0.1.43.exe`, die `.exe.blockmap` und `latest.yml` vorhanden sind.

Die App liest die öffentliche GitHub-Releasequelle über `electron-updater`. Ein neuer Tag allein genügt nicht; der Workflow muss fertig sein und einen veröffentlichten Release mit allen drei Dateien erzeugen. Der Updater funktioniert nur in einer installierten App mit eingebettetem `resources/app-update.yml`, nicht im Vite-Browser oder in der Entwicklungs-App.

Für jede weitere Version: `package.json` erhöhen, committen und pushen, danach den dazu passenden Tag `v<version>` pushen. Lokale Installer aus `corepack pnpm run release:win` erzeugen keinen GitHub Release.

## Freunde und Nachrichten

Die soziale Funktion nutzt dieselbe Supabase-Anmeldung. Vor der ersten Nutzung muss die Migration [202610190001_wavo_social.sql](supabase/migrations/202610190001_wavo_social.sql) einmal im SQL Editor des bestehenden Supabase-Projekts ausgeführt werden. Sie legt Profile, Freundschaften und Nachrichten mit Row Level Security an. Die Publishable Key genügt danach für die App; ein Service Role Key gehört nicht in den Client.

## Theme-Erweiterungen

Der Bereich **Extensions** akzeptiert deklarative Wavo-Theme-JSON-Dateien; siehe `examples/wavo-theme.json`.
