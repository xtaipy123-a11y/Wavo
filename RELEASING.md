# Wavo mit GitHub verbinden und Updates veröffentlichen

Der Ordner `D:\Wavo` ist als Git-Repository eingerichtet. `origin` zeigt auf `https://github.com/xtaipy123-a11y/Wavo.git`. Der erste Release `v0.1.43` ist auf GitHub veröffentlicht.

## Updates in Wavo

In der installierten App oben rechts **Nach Updates suchen** anklicken. Nach dem Download wechselt dieselbe Schaltfläche zu **Jetzt neu starten**. Wavo installiert das Update dann im Hintergrund und startet die neue Version. Beim ersten Start zeigt Wavo die Änderungen aus `RELEASE_NOTES.md`. Zusätzlich gibt es den Weg **Zahnrad unten links → Updates und Version → Nach Updates suchen**.

Die App liest die öffentliche GitHub-Releasequelle über `electron-updater`. Ein neuer Tag allein genügt nicht; der Workflow muss fertig sein und einen veröffentlichten Release mit allen drei Dateien erzeugen. Der Updater funktioniert nur in einer installierten App mit eingebettetem `resources/app-update.yml`, nicht im Vite-Browser oder in der Entwicklungs-App.

## Nächste Version veröffentlichen

Die nächste vorbereitete Version ist `0.1.47`. Vor jedem Release `package.json`, `src/shared/config/version.ts` und `RELEASE_NOTES.md` aktualisieren. Danach die Änderungen committen und `main` pushen; den Tag `v<version>` auf denselben Commit setzen und pushen. Der Workflow veröffentlicht den Installer, die `.exe.blockmap`, `latest.yml` und die Versionsnotizen. Unter **Actions** den erfolgreichen Lauf und unter **Releases** alle Dateien prüfen. Ein lokaler Build mit `corepack pnpm run release:win` veröffentlicht nichts auf GitHub.

## Freunde und Nachrichten

Die soziale Funktion nutzt dieselbe Supabase-Anmeldung. Vor der ersten Nutzung muss die Migration [202610190001_wavo_social.sql](supabase/migrations/202610190001_wavo_social.sql) einmal im SQL Editor des bestehenden Supabase-Projekts ausgeführt werden. Sie legt Profile, Freundschaften und Nachrichten mit Row Level Security an. Die Publishable Key genügt danach für die App; ein Service Role Key gehört nicht in den Client.

## Theme-Erweiterungen

Der Bereich **Extensions** akzeptiert deklarative Wavo-Theme-JSON-Dateien; siehe `examples/wavo-theme.json`.
