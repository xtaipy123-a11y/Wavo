# Wavo mit GitHub verbinden und Updates veröffentlichen

Der Ordner `D:\Wavo` ist als Git-Repository eingerichtet. `origin` zeigt auf `https://github.com/xtaipy123-a11y/Wavo.git`. Der erste Release `v0.1.43` ist auf GitHub veröffentlicht.

## Updates in Wavo

In der installierten App oben rechts **Nach Updates suchen** anklicken. Nach dem Download wechselt dieselbe Schaltfläche zu **Installieren**. Zusätzlich gibt es den Weg **Zahnrad unten links → Updates und Version → Nach Updates suchen**. In älteren Versionen ohne die Schaltfläche oben rechts funktioniert dieser Weg über das Zahnrad bereits.

Die App liest die öffentliche GitHub-Releasequelle über `electron-updater`. Ein neuer Tag allein genügt nicht; der Workflow muss fertig sein und einen veröffentlichten Release mit allen drei Dateien erzeugen. Der Updater funktioniert nur in einer installierten App mit eingebettetem `resources/app-update.yml`, nicht im Vite-Browser oder in der Entwicklungs-App.

## Nächste Version veröffentlichen

`v0.1.44` enthält die sichtbare Update-Schaltfläche. Den vorbereiteten Commit mit `git push origin main` hochladen, danach mit `git push origin v0.1.44` den Release-Workflow starten. Unter **Actions** den erfolgreichen Lauf und unter **Releases** den Installer, die `.exe.blockmap` und `latest.yml` prüfen. Lokale Installer aus `corepack pnpm run release:win` erzeugen keinen GitHub Release.

Für spätere Versionen `package.json` erhöhen, committen und pushen, danach den dazu passenden Tag `v<version>` pushen.

## Freunde und Nachrichten

Die soziale Funktion nutzt dieselbe Supabase-Anmeldung. Vor der ersten Nutzung muss die Migration [202610190001_wavo_social.sql](supabase/migrations/202610190001_wavo_social.sql) einmal im SQL Editor des bestehenden Supabase-Projekts ausgeführt werden. Sie legt Profile, Freundschaften und Nachrichten mit Row Level Security an. Die Publishable Key genügt danach für die App; ein Service Role Key gehört nicht in den Client.

## Theme-Erweiterungen

Der Bereich **Extensions** akzeptiert deklarative Wavo-Theme-JSON-Dateien; siehe `examples/wavo-theme.json`.
