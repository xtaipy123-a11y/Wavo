import { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Film, JellyfinStatus, Season } from '../src/movo/types'

function logStartupError(error: unknown) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  try { writeFileSync(join(app.getPath('userData'), 'cinecloud-startup-error.log'), message) } catch { /* logging must not hide the original error */ }
  console.error(message)
}
process.on('uncaughtException', logStartupError)
process.on('unhandledRejection', logStartupError)

type Session = { server: string; token: string; userId: string; user: string }
type StoredSession = { server: string; userId: string; user: string; token: string }
type JellyfinItem = { Id: string; Name: string; Type: string; ProductionYear?: number; Genres?: string[]; RunTimeTicks?: number; Overview?: string; ImageTags?: { Primary?: string }; BackdropImageTags?: string[]; UserData?: { PlaybackPositionTicks?: number }; IndexNumber?: number; ParentIndexNumber?: number; SeriesName?: string }

protocol.registerSchemesAsPrivileged([
  { scheme: 'movo-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
])

let session: Session | null = null
const deviceId = 'cinecloud-desktop-v1'
const authHeader = (token = '') => `MediaBrowser Client="CineCloud", Device="Desktop", DeviceId="${deviceId}", Version="0.1.0", Token="${token}"`
const sessionPath = () => join(app.getPath('userData'), 'jellyfin-session.json')

function normalizeServer(input: string) {
  const url = new URL(input.trim())
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Bitte eine gültige Jellyfin-Serveradresse eingeben.')
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname) && !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) {
    throw new Error('Für einen entfernten Jellyfin-Server bitte HTTPS verwenden.')
  }
  return url.toString().replace(/\/$/, '')
}

function saveSession() {
  if (!session || !safeStorage.isEncryptionAvailable()) return
  const stored: StoredSession = { server: session.server, userId: session.userId, user: session.user, token: safeStorage.encryptString(session.token).toString('base64') }
  writeFileSync(sessionPath(), JSON.stringify(stored), { mode: 0o600 })
}

function restoreSession(): JellyfinStatus {
  if (session) return { connected: true, server: session.server, user: session.user }
  if (!safeStorage.isEncryptionAvailable() || !existsSync(sessionPath())) return { connected: false }
  try {
    const stored = JSON.parse(readFileSync(sessionPath(), 'utf8')) as StoredSession
    session = { server: normalizeServer(stored.server), userId: stored.userId, user: stored.user, token: safeStorage.decryptString(Buffer.from(stored.token, 'base64')) }
    return { connected: true, server: session.server, user: session.user }
  } catch { return { connected: false } }
}

async function jellyfinFetch(path: string, options: RequestInit = {}) {
  if (!session) throw new Error('Bitte zuerst mit Jellyfin verbinden.')
  return fetch(`${session.server}${path}`, {
    ...options,
    headers: { 'X-Emby-Authorization': authHeader(session.token), ...(options.headers as Record<string, string> ?? {}) },
  })
}

function validId(id: string): string {
  if (!/^[a-fA-F0-9-]{16,64}$/.test(id)) throw new Error('Ungültige Jellyfin-ID.')
  return id
}

function mapJellyfinItem(item: JellyfinItem): Film {
  const mediaType = item.Type === 'Series' ? 'series' : item.Type === 'Episode' ? 'episode' : 'movie'
  return {
    id: `jellyfin-${item.Id}`,
    jellyfinId: item.Id,
    title: item.Name,
    year: item.ProductionYear ?? 0,
    genre: item.Genres?.[0] ?? (mediaType === 'series' ? 'Serie' : 'Film'),
    runtime: item.RunTimeTicks ? `${Math.round(item.RunTimeTicks / 600_000_000)} Min.` : mediaType === 'series' ? 'Serie' : 'Film',
    overview: item.Overview ?? 'Aus deiner Jellyfin-Mediathek',
    origin: 'jellyfin',
    mediaType,
    image: item.ImageTags?.Primary ? `movo-media://jellyfin/image/${item.Id}` : undefined,
    backdrop: item.BackdropImageTags?.length ? `movo-media://jellyfin/backdrop/${item.Id}` : undefined,
    video: mediaType === 'series' ? undefined : `movo-media://jellyfin/video/${item.Id}`,
    progress: item.UserData?.PlaybackPositionTicks && item.RunTimeTicks ? item.UserData.PlaybackPositionTicks / item.RunTimeTicks : 0,
    episodeNumber: item.IndexNumber,
    seasonNumber: item.ParentIndexNumber,
    seriesName: item.SeriesName,
  }
}

async function jellyfinItems(path: string): Promise<JellyfinItem[]> {
  const result = await jellyfinFetch(path)
  if (result.status === 401) { session = null; throw new Error('Die Jellyfin-Sitzung ist abgelaufen. Bitte erneut verbinden.') }
  if (!result.ok) throw new Error(`Jellyfin-Katalog konnte nicht geladen werden (${result.status}).`)
  const data = await result.json() as { Items?: JellyfinItem[] }
  return data.Items ?? []
}

async function listFilms(): Promise<Film[]> {
  if (!session) return []
  const params = new URLSearchParams({ UserId: session.userId, IncludeItemTypes: 'Movie,Series', Recursive: 'true', Fields: 'Overview,Genres,PrimaryImageAspectRatio,UserData', SortBy: 'DateCreated', SortOrder: 'Descending', Limit: '300' })
  return (await jellyfinItems(`/Items?${params}`)).map(mapJellyfinItem)
}

async function listSeasons(seriesId: string): Promise<Season[]> {
  if (!session) return []
  const params = new URLSearchParams({ UserId: session.userId, EnableUserData: 'true' })
  const items = await jellyfinItems(`/Shows/${validId(seriesId)}/Seasons?${params}`)
  return items.map(item => ({ id: item.Id, name: item.Name, number: item.IndexNumber ?? 0 })).sort((a, b) => a.number - b.number)
}

async function listEpisodes(seriesId: string, seasonId: string): Promise<Film[]> {
  if (!session) return []
  const params = new URLSearchParams({ UserId: session.userId, SeasonId: validId(seasonId), IsMissing: 'false', EnableUserData: 'true', Fields: 'Overview,Genres,UserData', Limit: '500' })
  const items = await jellyfinItems(`/Shows/${validId(seriesId)}/Episodes?${params}`)
  return items.filter(item => item.Type === 'Episode').sort((a, b) => (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0)).map(mapJellyfinItem)
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 950, minHeight: 620, backgroundColor: '#0b0d12',
    title: 'CineCloud',
    webPreferences: { preload: join(import.meta.dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.VITE_DEV_SERVER_URL) await win.loadURL(process.env.VITE_DEV_SERVER_URL)
  else await win.loadFile(join(import.meta.dirname, '../dist/index.html'))
}

app.whenReady().then(async () => {
  restoreSession()
  protocol.handle('movo-media', async request => {
    if (!session) return new Response('Nicht verbunden', { status: 401 })
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/(image|backdrop|video|transcode)\/([a-fA-F0-9-]+)$/)
    if (url.hostname !== 'jellyfin' || !match) return new Response('Ungültige Medienadresse', { status: 400 })
    const [, kind, id] = match
    const path = kind === 'image' ? `/Items/${id}/Images/Primary?maxWidth=640&quality=85`
      : kind === 'backdrop' ? `/Items/${id}/Images/Backdrop?maxWidth=1440&quality=85`
        : kind === 'transcode' ? `/Videos/${id}/stream.mp4?Static=false&VideoCodec=h264&AudioCodec=aac&VideoBitRate=8000000&AudioBitRate=192000&MaxWidth=1920&MaxHeight=1080&AllowVideoStreamCopy=false&AllowAudioStreamCopy=false`
          : `/Videos/${id}/stream?Static=true`
    try {
      const headers: Record<string, string> = { 'X-Emby-Authorization': authHeader(session.token) }
      const range = request.headers.get('range')
      if (range) headers.Range = range
      return await net.fetch(`${session.server}${path}`, { headers })
    } catch { return new Response('Jellyfin ist nicht erreichbar', { status: 502 }) }
  })

  ipcMain.handle('jellyfin:connect', async (_event, address: string, username: string, password: string): Promise<JellyfinStatus> => {
    try {
      const server = normalizeServer(address)
      if (!username.trim()) throw new Error('Bitte einen Benutzernamen eingeben.')
      const response = await fetch(`${server}/Users/AuthenticateByName`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Emby-Authorization': authHeader() }, body: JSON.stringify({ Username: username.trim(), Pw: password }) })
      if (!response.ok) throw new Error(response.status === 401 ? 'Jellyfin-Anmeldung fehlgeschlagen.' : `Jellyfin antwortet mit ${response.status}.`)
      const data = await response.json() as { AccessToken?: string; User?: { Id?: string; Name?: string } }
      if (!data.AccessToken || !data.User?.Id) throw new Error('Jellyfin hat keine gültige Sitzung geliefert.')
      session = { server, token: data.AccessToken, userId: data.User.Id, user: data.User.Name ?? username.trim() }
      saveSession()
      return { connected: true, server, user: session.user }
    } catch (error) { return { connected: false, error: error instanceof Error ? error.message : 'Verbindung fehlgeschlagen.' } }
  })
  ipcMain.handle('jellyfin:restore', () => restoreSession())
  ipcMain.handle('jellyfin:disconnect', () => { session = null; try { writeFileSync(sessionPath(), '', { mode: 0o600 }) } catch { /* no saved session */ } })
  ipcMain.handle('jellyfin:films', () => listFilms())
  ipcMain.handle('jellyfin:seasons', (_event, seriesId: string) => listSeasons(seriesId))
  ipcMain.handle('jellyfin:episodes', (_event, seriesId: string, seasonId: string) => listEpisodes(seriesId, seasonId))
  ipcMain.handle('external:open', (_event, url: string) => { if (new URL(url).protocol !== 'https:') throw new Error('Nur HTTPS-Links erlaubt.'); return shell.openExternal(url) })
  ipcMain.handle('wavo:launch', async () => {
    const local = process.env.LOCALAPPDATA ?? ''
    const candidates = [join(local, 'Programs', 'wavo', 'wavo.exe'), join(local, 'Programs', 'Wavo', 'Wavo.exe'), join(import.meta.dirname, '../../release/win-unpacked/wavo.exe')]
    const installed = candidates.find(existsSync)
    if (installed) { const error = await shell.openPath(installed); return { ok: !error, message: error || undefined } }
    const selected = await dialog.showOpenDialog({ title: 'Wavo.exe auswählen', filters: [{ name: 'Wavo', extensions: ['exe'] }], properties: ['openFile'] })
    if (selected.canceled || !selected.filePaths[0]) return { ok: false, message: 'Wavo wurde nicht ausgewählt.' }
    const error = await shell.openPath(selected.filePaths[0])
    return { ok: !error, message: error || undefined }
  })
  await createWindow()
}).catch(logStartupError)

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow() })
