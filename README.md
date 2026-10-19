# Wavo Desktop

Electron and Vite music player with Supabase Auth.

## Development

```powershell
corepack pnpm install
corepack pnpm dev
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are read from `.env.local` when Vite starts. Email and password sign-in, sign-up, automatic refresh, and sign-out use Supabase Auth. If email confirmation is enabled in Supabase, new users confirm through the email link and then sign in inside Wavo.

The supplied Next.js `page.tsx` and middleware examples do not run in this Electron/Vite project. `@supabase/ssr` is installed as requested but is not used by the desktop renderer.

## Music API

Catalog search and playback use the desktop client's YouTube Music integration. Home discovery also uses that catalog. Lyrics are fetched from LRCLIB. Likes, saved albums/artists/catalog playlists, user playlists, and listening history are stored on this device under the signed-in Supabase user ID; they do not sync between devices. Supabase handles sign-in, sessions, friendships and private messages.

The **Friends** page supports username search, friend requests, private chat and playlist sharing. A shared playlist is sent as a snapshot; the recipient can import a copy into their library. The sender's local playlist is not made public. Run [the social database migration](supabase/migrations/202610190001_wavo_social.sql) once in the existing Supabase project's SQL Editor before using the feature.

User playlists can be backed up as JSON and imported on another device from Settings → Storage. Imports add copies to the signed-in account on that device. The queue can be saved as a playlist, and the mini player has a sleep timer with 15, 30, 45, and 60 minute options or a stop after the current track.

Other legacy music features may still call the existing music API at `https://api.tryliner.fun` and may require its old account system. Supabase tokens are **not** sent there.

To connect such an API, set `VITE_API_URL` to its HTTPS URL and `VITE_MUSIC_API_ACCEPTS_SUPABASE_JWT=true` in `.env.local`, then rebuild. The app does not assume that the old service accepts Supabase credentials.

The Windows installer is built locally in `release/`. The auto-updater is configured for GitHub releases at `xtaipy123-a11y/Wavo`; a local installer is not published automatically. See [RELEASING.md](RELEASING.md) for the first GitHub release. Local share links use the `wavo://` protocol.
