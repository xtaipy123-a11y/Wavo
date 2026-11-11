# Neu in Wavo 0.156.0

## Added

- **Entdecken auf der Startseite:** Die Startseite lädt ihre Reihen jetzt direkt aus dem Katalog – Neuerscheinungen, Charts, Stimmungen und Genres inklusive. Eine personalisierte Empfehlung entsteht aus Favoriten, Hörverlauf und Playlists; ohne persönliche Daten greift sie auf die Entdecken-Auswahl zurück.
- **Ausgeblendete Songs:** Songs lassen sich über das Songmenü ausblenden. Sie verschwinden aus Playlists, Warteschlange, Radio, Autoplay und Shuffle, bleiben aber in der Bibliothek unter **Ausgeblendete Songs** einsehbar. Ein Hinweis bietet direkt **Rückgängig** an.
- **Smart Shuffle:** Die Shuffle-Schaltfläche wechselt jetzt zwischen aus, zufällig und smart. Smart Shuffle gewichtet Favoriten und meidet ausgeblendete Titel; Mini- und Vollbildplayer markieren den aktiven Modus.
- **Playlist-Links ohne Share-Server:** Eigene Playlists lassen sich als vollständiger Link teilen. Reihenfolge und Ausblendstatus reisen gzip-gepackt im `wavo://`-Link; Empfänger importieren eine Kopie.
- **Flexibler Sleep-Timer:** Neben 15, 30, 45 und 60 Minuten sowie „nach diesem Song“ akzeptiert der Timer jetzt eine eigene Dauer von 1 bis 1440 Minuten.
- **Liedtext-Optionen gebündelt:** Quelle, Offset in Millisekunden oder Sekunden und der Wort-Timing-Editor liegen im Player-Menü an einer Stelle. Intro und Outro mit ausreichend Abstand erscheinen als Pausenlinie.
- **SoundCloud-Metadaten:** SoundCloud-Titel zeigen Titel, Künstler, Cover und Dauer jetzt auch dann korrekt an, wenn sie über einen Link geöffnet werden; die Auflösung läuft im Client und wird zwischengespeichert.
- **Marken-Icon unter Windows:** Beim Wechsel des Branding-Stils aktualisiert Wavo auch das App-Icon und bestehende Windows-Verknüpfungen.

## Changes

- **Startseite neu aufgebaut:** Begrüßung mit Namen, kompakte Schnellzugriffe, Ladeplatzhalter und verzögertes Laden von Covern machen den Einstieg schneller. Die Entdecken-Reihen lassen sich bei Fehlern erneut laden.
- **Automatische Downloads sind jetzt opt-in:** Neuinstallationen und bestehende Installationen starten mit deaktivierten automatischen Downloads. Beide Optionen bleiben unter **Einstellungen → Audio → Offline-Downloads** einzeln aktivierbar.
- **Freunde und Hörsessions überarbeitet:** Der Bereich für gemeinsames Hören hat ein neues Layout mit Teilnehmern, Warteschlange, Abstimmungen und Rechteverwaltung; Einladungen und Leerzustände sind klarer.
- **Importe robuster:** Spotify-Importe erkennen versteckte Titel, übernehmen sie als ausgeblendet und behandeln Embed- sowie Pathfinder-Antworten stabiler. SoundCloud-Importe vereinheitlichen ihre Track-IDs.
- **Branding-Assets vereinheitlicht:** Alle Logo-Varianten liegen als PNG vor; Pixel- und Scanlines-Theme brauchen keine Sonderbehandlung mehr.
- **Cover laden später:** Cover außerhalb des sichtbaren Bereichs werden erst kurz vor dem Scrollen geladen. Das reduziert Netzwerkanfragen auf der Startseite und in langen Listen.

## Fixes

- **Wort-Timing bei TTML:** Übersetzungs- und Romanisierungs-Spans aus Apple-/AMLL-Liedtexten verfälschen die Wortzeiten nicht mehr.
- **Warteschlange und Dislikes:** Wird der laufende Titel ausgeblendet, spielt Wavo mit dem nächsten Titel weiter, ohne die Positionen der übrigen Einträge zu verschieben. Ausgeblendete Titel lassen sich nicht erneut manuell einreihen.
- **Geteilte Playlists:** Beschädigte oder manipulierte Links werden abgefangen und als ungültig gemeldet, statt die App zu verlassen oder leere Playlists anzulegen.
- **Cover-Wiederholung:** Fehlgeschlagene Cover-Anfragen werden weiterhin automatisch erneut versucht; verzögertes Laden blockiert die Wiederholung nicht mehr.
- **Liedtext-Lücken:** Intro und Outro werden nur noch als Pause angezeigt, wenn tatsächlich ein ausreichender Abstand zum ersten bzw. letzten Vers besteht.

## Seit 0.1.55

### Added

- **Discord Rich Presence:** Die Desktop-App zeigt den aktuellen Song, Künstler und Wiedergabefortschritt auf Discord, inklusive Link zum Wavo-Download. Die Verbindung wird automatisch wiederhergestellt, wenn Discord später startet. Unter **Einstellungen → Wiedergabe** lässt sich die Anzeige abschalten; beim Pausieren, Laden oder Beenden wird die Aktivität entfernt. Benötigt die Discord-Desktop-App mit aktivierter Aktivitätsfreigabe.
- **Automatische Offline-Downloads:** Neu favorisierte Songs und neu zu eigenen Playlists hinzugefügte Titel werden auf diesem Gerät automatisch gespeichert, auch bei Playlist-Importen. Beide Optionen waren zunächst standardmäßig aktiv und sind seit 0.156.0 standardmäßig ausgeschaltet; sie bleiben unter **Einstellungen → Audio → Offline-Downloads** einzeln aktivierbar. Ausstehende automatische Downloads bleiben für den nächsten Start oder eine erneute Internetverbindung vorgemerkt.
- **Direkt offline speichern:** Download-Schaltflächen neben Songs und bei beliebten Titeln auf der Startseite sowie **Offline speichern** für die geladenen Songs einer Playlist oder eines Albums. Bereits gespeicherte Titel werden übersprungen; bei Sammeldownloads werden Fortschritt und fehlgeschlagene Downloads angezeigt.
- **Globale Tastenkürzel:** Für jedes Kürzel lässt sich wählen, ob es nur im jeweiligen Wavo-Fenster oder auch bei aktiven anderen Programmen gilt. Nicht verfügbare globale Kombinationen werden in den Einstellungen markiert.
- **Liedtexte im Vollbild ein- und ausblenden:** Eine neue Schaltfläche blendet den Liedtextbereich mit einem animierten Übergang aus und gibt dem Player die volle Breite. Wavo merkt sich die Auswahl und berücksichtigt reduzierte Bewegung.

### Changes

- **Vollbildplayer aufgeräumt:** Covergröße, Wiedergabegeschwindigkeit und Tonhöhe sind im neuen Menü **Player-Einstellungen** gebündelt. Favoriten lassen sich über das Herz direkt neben dem Songtitel umschalten; Downloads sind über Songlisten und Playlists erreichbar.
- **Wiederholung deutlicher erkennbar:** Mini- und Vollbildplayer zeigen aktive Wiederholung mit hervorgehobenem Symbol und Statuspunkt. Beschriftungen unterscheiden zwischen ausgeschalteter Wiederholung, Playlist- und Song-Wiederholung.
- **Freunde-Bereich überarbeitet:** Neues Layout für Unterhaltungen, Hörsessions und gemeinsame Playlists, mit klareren Leerzuständen, einem sichtbaren Schalter zum Teilen der Höraktivität und einer Playlist-Auswahl mit Hinweis, wenn noch keine eigenen Playlists vorhanden sind.
- **Englisch als Startsprache:** Neue Installationen starten unabhängig von der Systemsprache auf Englisch. Eine ausdrücklich gespeicherte Sprachauswahl bleibt erhalten.
- **Entwicklung ohne Anmeldepflicht:** Der Entwicklungsserver öffnet Wavo standardmäßig ohne Anmeldung; mit `VITE_DEV_SKIP_LOGIN=false` lässt sich der reguläre Anmeldeablauf testen. Entwicklungsfavoriten werden getrennt von echten Konten gespeichert. Veröffentlichte Builds verlangen weiterhin eine Anmeldung.

### Fixes

- **Windows-Fensterverhalten korrigiert:** Verschieben nutzt die native Fenstersteuerung und vermeidet Größenabweichungen bei nicht ganzzahliger Bildschirmskalierung. Maximieren und Wiederherstellen nutzen wieder das native Windows-Verhalten; Fensterecken passen sich dem maximierten Zustand an.
- **Downloads robuster:** Gleichzeitige Anfragen für denselben Song teilen sich einen Download; höchstens zwei Downloads laufen parallel. Veraltete Ladevorgänge überschreiben die aktuelle Downloadliste nicht mehr. Auch wartende Downloads können über das Songmenü abgebrochen werden.
- **Tastenkürzel besser abgestimmt:** Global registrierte Kürzel werden im Fenster nicht zusätzlich ausgelöst. Während der Aufnahme einer neuen Kombination pausieren die Kürzel; Hauptfenster und Overlay gleichen ihre Einstellungen ab.
- **Bedienung und Rückmeldungen korrigiert:** Die Freundesuche verwirft alte Ergebnisse beim Ändern des Suchbegriffs und zeigt Lade- sowie Leerzustände. Tastatureingaben an Schaltflächen innerhalb einer Songzeile starten nicht zusätzlich die Wiedergabe. Favoriten-Schaltflächen haben eindeutige Beschriftungen und einen auslesbaren Aktivstatus.

## Seit 0.1.54

- Eigene Playlists zeigen jetzt passende Songvorschläge aus der vorhandenen Musikquelle. Ein Klick auf **+** fügt den Song direkt hinzu; bereits enthaltene Songs und doppelte Vorschläge werden ausgeblendet.
- Mit **Neue Vorschläge** lassen sich weitere Titel entdecken.
- Ein Android-Projekt ist vorbereitet. Eine lokale Debug-APK kann mit dem Android SDK gebaut werden; die Android-Laufzeit ist noch nicht vollständig auf einem Emulator verifiziert.

## Seit 0.1.53

- Eigene Songs werden nach dem Dateiupload wieder in der Bibliothek gespeichert. Der Fehler „new row violates row-level security policy for table wavo_uploads“ ist behoben.
- Die privaten Supabase-Zugriffsregeln bleiben bestehen; für dieses Update ist keine SQL-Migration nötig.

## Seit 0.1.52

- Eigene Musik erkennt gültige Supabase-Konten wieder: Uploads, EPs, Alben, Freigabelinks und Wiedergabe werden nicht mehr fälschlich als „nicht angemeldet“ blockiert.
- Einladungen zu gemeinsamen Playlists akzeptieren gültige Nutzer- und Playlist-IDs wieder.
- Für diese Korrektur ist keine neue SQL-Migration nötig.

## Seit 0.1.51

- Eigene Musik als MP3, WAV, FLAC, M4A, AAC, OGG oder WebM hochladen. Jeder Song erscheint zunächst als private Single.
- Aus hochgeladenen Songs EPs und Alben mit eigener Reihenfolge, Beschreibung und Cover erstellen.
- Private Veröffentlichungen direkt an Freunde im Chat senden oder einen zeitlich begrenzten Freigabelink kopieren.
- Geteilte Songs und EPs in Wavo abspielen; eigene Uploads erscheinen nicht in der allgemeinen Musiksuche.
- Die Dateien liegen in einem privaten Supabase-Bucket. Row Level Security beschränkt den Zugriff auf Besitzer und gezielt freigegebene Nutzer.

**Einrichtung:** Vor dem ersten Upload muss `supabase/migrations/202610220001_wavo_private_music.sql` im bestehenden Wavo-Supabase-Projekt ausgeführt werden. Die Migration ergänzt die vorhandenen Freunde- und Chat-Tabellen, ohne vorhandene Musikdaten zu entfernen.

## Seit 0.1.50

- Der Windows-Installer kann bestehende Wavo-Installationen auf einem anderen Laufwerk als dem Windows-Temp-Ordner jetzt aktualisieren und deinstallieren. Das behebt den Fehler „Die alten Anwendungsdateien konnten nicht deinstalliert werden: 2“.

## Seit 0.1.49

- Wavo Cloud synchronisiert Favoriten, eigene Playlists, gespeicherte Alben und Künstler, Hörverlauf, Warteschlange, Wiedergabeposition, Einstellungen, Themes und Smart-Playlist-Regeln. Offline-Änderungen werden später abgeglichen.
- Wavo Connect zeigt angemeldete Geräte und erlaubt Fernsteuerung sowie die Fortsetzung auf einem anderen Gerät.
- Freunde können gemeinsame Playlist-Kopien bearbeiten und in Hörsessions über Songs abstimmen. Die Anzeige des aktuell gehörten Songs ist freiwillig.
- Musikstatistiken und Wavo Wrapped zeigen persönliche Rückblicke. Der Hörverlauf kann gelöscht werden.
- Supabase-Sitzungen werden in der Desktop-App geschützt gespeichert.

**Einrichtung:** Für Cloud, Connect und die neuen sozialen Funktionen müssen die beiden SQL-Dateien `supabase/migrations/202610200002_wavo_cloud_connect.sql` und `supabase/migrations/202610200003_wavo_social_extensions.sql` im bestehenden Supabase-Projekt ausgeführt werden. Bis dahin bleiben lokale Musikdaten nutzbar; die Cloud-Anzeige meldet einen Synchronisierungsfehler.
