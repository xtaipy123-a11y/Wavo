import { contextBridge, ipcRenderer } from 'electron'
import type { CineCloudBridge } from '../src/movo/types'

const bridge: CineCloudBridge = {
  connectJellyfin: (server, username, password) => ipcRenderer.invoke('jellyfin:connect', server, username, password),
  restoreJellyfin: () => ipcRenderer.invoke('jellyfin:restore'),
  disconnectJellyfin: () => ipcRenderer.invoke('jellyfin:disconnect'),
  getJellyfinFilms: () => ipcRenderer.invoke('jellyfin:films'),
  getJellyfinSeasons: seriesId => ipcRenderer.invoke('jellyfin:seasons', seriesId),
  getJellyfinEpisodes: (seriesId, seasonId) => ipcRenderer.invoke('jellyfin:episodes', seriesId, seasonId),
  launchWavo: () => ipcRenderer.invoke('wavo:launch'),
  openExternal: url => ipcRenderer.invoke('external:open', url),
}

contextBridge.exposeInMainWorld('cinecloud', bridge)
