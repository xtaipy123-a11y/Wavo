# Neu in Wavo 0.1.51

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
