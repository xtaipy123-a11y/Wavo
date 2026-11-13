<p align="center">
  <img src="src/assets/logo.png" width="96" height="96" alt="Wavo" />
</p>

<h1 align="center">Wavo</h1>

<p align="center"><strong>Your music, all in one place.</strong></p>

<p align="center">
  <a href="https://github.com/xtaipy123-a11y/Wavo/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/xtaipy123-a11y/Wavo?style=flat-square&color=7c5cff"></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-1f6feb?style=flat-square">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-44-47848F?style=flat-square&logo=electron&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=101010">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square"></a>
</p>

Wavo is a modern desktop music player that brings catalog streaming, your own library, synchronized lyrics, offline listening and shared listening together in one app. The current release is **0.156.1**.

---

## What Wavo is

Wavo is built with Electron 44, React 19, TypeScript and Vite. It runs as a native desktop app on Windows, macOS and Linux; Windows is the primary release target. Catalog search and streaming use a built-in YouTube Music integration and SoundCloud. Sign-in, friends, chat, cloud sync and shared listening are powered by Supabase, while your library and playback cache stay on your device.

An Android project (Capacitor) is included and can be built as a debug APK. It is an early test target and not yet a finished mobile release.

## What Wavo can do

### Listen

- Search the catalog and play tracks, albums, artists and playlists without leaving the app.
- Queue management with play next, add to queue, reorder, clear upcoming and save the queue as a playlist.
- Shuffle, **Smart Shuffle** that favors artists you like, and autoplay radio when the queue ends.
- Speed and pitch control with key lock, vinyl-style linked pitch, presets and reverb.
- Sleep timer with presets, a custom duration up to 24 hours, or stop after the current track.
- Media keys, in-app shortcuts and optional system-wide global shortcuts.

### Lyrics

- Line-synchronized and word-synchronized lyrics from multiple providers, including LRCLIB and AMLL. Matching ignores remaster, live and featuring tags and checks the track duration before word-timed lyrics are used.
- Manual word-timing editor for songs without word-level timestamps.
- Lyrics offset in milliseconds or seconds, provider switching and intro/outro pause lines.
- Fullscreen player with dynamic WebGL backgrounds, resizable artwork and a hideable lyrics pane.

### Library and discovery

- Favorites, **disliked songs**, saved albums, saved artists, listening history and your own playlists.
- Disliked songs are hidden from playlists, queues, radio, autoplay and shuffle, but remain manageable in the library.
- Home discovery with new releases, charts, moods and genres, daily mixes and personalized recommendations.
- Grid and list views, sorting, search and a storage breakdown for covers, audio, lyrics and metadata.

### Imports and sharing

- Import playlists from Spotify, YouTube, SoundCloud, Deezer and Apple Music links.
- Review proposed matches before importing and skip tracks that cannot be matched.
- Import SoundCloud likes by username.
- Share self-contained playlist links that carry the full track snapshot; recipients import a copy.
- Share albums and playlists with friends in chat, or back up your playlists as JSON.

### Offline

- Download single tracks, full albums and playlists for offline listening.
- Optional automatic downloads for new favorites and playlist additions (off by default).
- Configurable cache limits with automatic cleanup of older files.

### Desktop experience

- Mini player and a floating, always-on-top desktop overlay.
- Discord Rich Presence with the current song, artist and live progress.
- Custom wallpapers (including animated GIFs), glassmorphism blur, accent branding and installable theme files. Branding changes update the app icon, desktop shortcuts and taskbar pins immediately.
- `wavo://` deep links for tracks, albums, artists, playlists and private releases.
- Automatic updates from GitHub Releases in the installed desktop app.

### Social and cloud

- Friends, friend requests, private chat and public or private profiles.
- Shared listening sessions: synchronized playback, shared queue, voting, guest requests and per-friend permissions. Start a session from any playlist with **Listen together**, with host-controlled repeat and shuffle and lyrics that stay in sync for every guest.
- **Wavo Cloud** sync for favorites, playlists, saved collections, history, queue, settings and smart-playlist rules.
- **Wavo Connect** to see signed-in devices and continue playback on another device.
- Music statistics, Wavo Wrapped and smart playlists.
- Private music uploads (MP3, WAV, FLAC, M4A, AAC, OGG, WebM), private singles, EPs and albums, shareable with friends or through expiring links.

### Privacy

- Your library, dislikes and playback cache are stored locally per signed-in account.
- Supabase handles authentication and social state; no service-role key ships with the app.
- Anonymous telemetry is optional and can be disabled completely in Settings.
- Supabase tokens are not forwarded to the legacy music API.

## Install Wavo

1. Open the [latest release](https://github.com/xtaipy123-a11y/Wavo/releases/latest).
2. Download `Wavo-Setup-<version>.exe` and run the installer.
3. Sign in to your Wavo account. Production builds always require sign-in.

Installed builds update themselves through GitHub Releases. macOS and Linux packages can be built from source with the commands below; official installers are currently published for Windows.

## Changelog and releases

Every Wavo version ships with a changelog. The complete history is in [RELEASE_NOTES.md](RELEASE_NOTES.md), and each GitHub release publishes the same notes together with the Windows installer, blockmap and update metadata.

The release process is documented in [RELEASING.md](RELEASING.md). The app version is read from `package.json`; Android and the in-app version labels are updated alongside it.

## License

Wavo is released under the MIT License. See [LICENSE](LICENSE).
