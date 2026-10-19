import { commonsFilms } from './catalog'
import type { Film } from './types'

type Metadata = { value?: string }
type Derivative = { src: string; width?: number; type?: string }
type VideoInfo = { url?: string; thumburl?: string; descriptionurl?: string; derivatives?: Derivative[]; extmetadata?: Record<string, Metadata> }
type CommonsPage = { title: string; videoinfo?: VideoInfo[] }

export async function loadCommonsFilms(): Promise<Film[]> {
  const titles = commonsFilms.map(film => film.fileTitle).join('|')
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  url.search = new URLSearchParams({ action: 'query', prop: 'videoinfo', viprop: 'url|derivatives|extmetadata', viurlwidth: '960', format: 'json', origin: '*', titles }).toString()
  const response = await fetch(url)
  if (!response.ok) throw new Error('Der freie Filmkatalog ist gerade nicht erreichbar.')
  const data = await response.json() as { query?: { pages?: Record<string, CommonsPage> } }
  const entries = new Map(Object.values(data.query?.pages ?? {}).map(page => [page.title, page.videoinfo?.[0]]))
  return commonsFilms.map(film => {
    const info = entries.get(film.fileTitle!)
    const derivatives = info?.derivatives?.filter(item => item.type?.includes('webm') && item.width && item.width <= 1920) ?? []
    const preferred = derivatives.find(item => item.width && item.width >= 1200 && item.width <= 1500) ?? derivatives.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
    return {
      ...film,
      image: info?.thumburl,
      backdrop: info?.thumburl,
      video: preferred?.src ?? info?.url,
      sourcePage: info?.descriptionurl,
      license: info?.extmetadata?.LicenseShortName?.value?.replace(/<[^>]*>/g, ''),
      licenseUrl: info?.extmetadata?.LicenseUrl?.value,
    }
  })
}
