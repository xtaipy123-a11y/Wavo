# Wavo Supabase-Erweiterungen

Die bestehende Authentifizierung sowie `wavo_profiles`, `wavo_friendships`, `wavo_messages`,
`wavo_listening_rooms`, `wavo_listening_members` und `wavo_listening_commands` bleiben erhalten.
Diese sechs Tabellen waren am 20.10.2026 über die konfigurierte Supabase Data API vorhanden;
die internen Live-Policies sind mit dem Publishable Key nicht einsehbar. Die früheren
Migrationen in diesem Ordner dokumentieren ihre erwartete Struktur.

Die neuen Tabellen waren bei der Prüfung noch nicht vorhanden. Die Erweiterung besteht aus:

1. `202610200002_wavo_cloud_connect.sql`: private Sync-Dokumente, Geräte, Befehle,
   Wiedergabeereignisse, Compare-and-swap-RPC und Datenschutz-Löschung mit Schutz
   gegen verspätete Uploads alter Hörereignisse.
2. `202610200003_wavo_social_extensions.sql`: gemeinsame Playlists, Abstimmungen und
   optionale Freundesaktivität.

Beide Dateien sind additiv. Sie enthalten keine Änderung oder Löschung bestehender
Freundschaften, Chats und Hörsessions. Vor einer produktiven Anwendung ein Datenbank-Backup
anlegen und die Dateien in dieser Reihenfolge im SQL Editor des bestehenden Projekts ausführen.
Der Desktop-Client besitzt bewusst nur den Publishable Key und kann DDL-Migrationen nicht selbst ausführen.

## Prüfung nach der Migration

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'wavo_%'
order by table_name;

select tablename, policyname from pg_policies
where schemaname = 'public' and tablename like 'wavo_%'
order by tablename, policyname;

select proname from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public' and proname in
  ('wavo_apply_sync_document', 'wavo_clear_listening_history',
   'wavo_can_read_shared_playlist', 'wavo_can_edit_shared_playlist');
```

Für einen echten Berechtigungstest zwei normale Supabase-Nutzer verwenden: Nutzer B darf
private Sync-Dokumente, Geräte und Wiedergabeereignisse von Nutzer A nicht lesen.
Ein eingeladener Freund darf die gemeinsame Playlist lesen; nur ein aktiver Editor darf
Tracks ändern. Freundesaktivität ist standardmäßig unsichtbar und läuft ohne Heartbeat aus.

Die App zeigt den Synchronisierungszustand unter **Einstellungen → Speicher → Wavo Cloud**.
Bis beide Migrationen angewendet sind, bleiben lokale Musikdaten nutzbar und die Cloud
meldet einen wiederholbaren Fehler.
