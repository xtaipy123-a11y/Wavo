# Neu in Wavo 0.1.49

- Wavo Cloud synchronisiert Favoriten, eigene Playlists, gespeicherte Alben und Künstler, Hörverlauf, Warteschlange, Wiedergabeposition, Einstellungen, Themes und Smart-Playlist-Regeln. Offline-Änderungen werden später abgeglichen.
- Wavo Connect zeigt angemeldete Geräte und erlaubt Fernsteuerung sowie die Fortsetzung auf einem anderen Gerät.
- Freunde können gemeinsame Playlist-Kopien bearbeiten und in Hörsessions über Songs abstimmen. Die Anzeige des aktuell gehörten Songs ist freiwillig.
- Musikstatistiken und Wavo Wrapped zeigen persönliche Rückblicke. Der Hörverlauf kann gelöscht werden.
- Supabase-Sitzungen werden in der Desktop-App geschützt gespeichert.

**Einrichtung:** Für Cloud, Connect und die neuen sozialen Funktionen müssen die beiden SQL-Dateien `supabase/migrations/202610200002_wavo_cloud_connect.sql` und `supabase/migrations/202610200003_wavo_social_extensions.sql` im bestehenden Supabase-Projekt ausgeführt werden. Bis dahin bleiben lokale Musikdaten nutzbar; die Cloud-Anzeige meldet einen Synchronisierungsfehler.
