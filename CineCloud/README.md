# CineCloud

CineCloud ist ein eigenständiger Desktop-Hub für **Movo** (Filme) und **Wavo** (Musik). Movo spielt offen lizenzierte Filme von Wikimedia Commons ab und kann die eigene Jellyfin-Mediathek anzeigen. Wavo wird als vorhandene Desktop-App gestartet.

## Starten

```powershell
cd D:\Wavo\CineCloud
corepack pnpm install
corepack pnpm dev
```

Windows-Installer erstellen:

```powershell
corepack pnpm release:win
corepack pnpm release:movo:win
```

Die Installer `CineCloud-Setup-0.1.1.exe` und `Movo-Setup-0.1.1.exe` liegen anschließend unter `release/`. CineCloud startet Movo und die vorhandene Wavo-App; Movo kann auch eigenständig installiert werden.

## Jellyfin verbinden

In **Einstellungen → Jellyfin verbinden** Serveradresse, Benutzername und Passwort eingeben. Bei lokalen Servern ist `http://192.168.x.x:8096` möglich; für öffentliche Server ist HTTPS erforderlich. Der Zugriffstoken wird, wenn das Betriebssystem Verschlüsselung bereitstellt, verschlüsselt im lokalen App-Datenverzeichnis gespeichert. Das Passwort wird nicht gespeichert. Bilder und Streams werden über ein internes Electron-Protokoll geladen; der Token erscheint nicht in der Video-URL im Renderer.

Movo zeigt Filme und Serien getrennt. In einer Serie lassen sich Staffeln und Folgen öffnen. Wenn Chromium ein Jellyfin-Video nicht direkt abspielen kann, fordert Movo automatisch einen H.264/AAC-Stream vom Jellyfin-Server an. Falls auch das fehlschlägt, erscheint ein Link zum Server. Die Verbindung wurde ohne Zugang zu einem echten Jellyfin-Server implementiert und muss mit der eigenen Installation geprüft werden.

## Filmquellen

Der freie Katalog wird über die [MediaWiki-Video-API](https://www.mediawiki.org/wiki/Extension:TimedMediaHandler/API) geladen. Quelle, Urheber und Lizenz sind auf der Filmseite in Movo verlinkt. Die eigene Jellyfin-Bibliothek wird über die Jellyfin-API abgerufen. Aktuelle kommerzielle Titel werden nur auf offizielle Angebote verlinkt, wenn keine frei nutzbare Streamquelle vorliegt.

[Moonfin](https://github.com/Moonfin-Client) ist ebenfalls ein Jellyfin/Emby-Client und liefert selbst keine Filme. Movo nutzt die Jellyfin-API direkt; es übernimmt keinen Moonfin-Code.
