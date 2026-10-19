export type Film = {
  id: string
  title: string
  year: number
  genre: string
  runtime: string
  overview: string
  origin: 'commons' | 'jellyfin' | 'external'
  fileTitle?: string
  image?: string
  backdrop?: string
  video?: string
  sourcePage?: string
  license?: string
  licenseUrl?: string
  creator?: string
  offerUrl?: string
  jellyfinId?: string
  progress?: number
  mediaType?: 'movie' | 'series' | 'episode'
  episodeNumber?: number
  seasonNumber?: number
  seriesName?: string
}

export type JellyfinStatus = { connected: boolean; server?: string; user?: string; error?: string }
export type Season = { id: string; name: string; number: number }

export type CineCloudBridge = {
  connectJellyfin: (server: string, username: string, password: string) => Promise<JellyfinStatus>
  restoreJellyfin: () => Promise<JellyfinStatus>
  disconnectJellyfin: () => Promise<void>
  getJellyfinFilms: () => Promise<Film[]>
  getJellyfinSeasons: (seriesId: string) => Promise<Season[]>
  getJellyfinEpisodes: (seriesId: string, seasonId: string) => Promise<Film[]>
  launchWavo: () => Promise<{ ok: boolean; message?: string }>
  openExternal: (url: string) => Promise<void>
}

declare global {
  interface Window { cinecloud?: CineCloudBridge }
}
