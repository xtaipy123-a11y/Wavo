import { useEffect, useMemo, useRef, useState } from 'react'
import { FiArrowLeft, FiArrowRight, FiCheck, FiChevronDown, FiCompass, FiFilm, FiHeart, FiHome, FiInfo, FiMaximize2, FiMusic, FiPlay, FiPlus, FiSearch, FiSettings, FiX } from 'react-icons/fi'
import { commonsFilms, upcomingFilm } from './movo/catalog'
import { loadCommonsFilms } from './movo/commons'
import type { Film, JellyfinStatus, Season } from './movo/types'
import './series.css'

type Page = 'hub' | 'movo' | 'watchlist' | 'settings'

function readStore<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fallback }
}

function saveStore<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)) }

function FilmArtwork({ film, className = '' }: { film: Film; className?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={`artwork ${className} artwork-${film.id.replace(/[^a-z0-9]/g, '')}`}>
      {film.image && !failed ? <img src={film.image} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span className="artwork-fallback"><FiFilm /><small>{film.origin === 'jellyfin' ? 'DEINE MEDIATHEK' : 'CINECLOUD ORIGINALS'}</small></span>}
      <span className="artwork-shade" />
    </div>
  )
}

function FilmCard({ film, saved, onSelect, onSave }: { film: Film; saved: boolean; onSelect: () => void; onSave: () => void }) {
  return (
    <article className="film-card">
      <button className="film-card-main" onClick={onSelect} aria-label={`${film.title} öffnen`}>
        <FilmArtwork film={film} />
        <span className="film-card-play"><FiPlay fill="currentColor" /></span>
        {film.progress ? <span className="card-progress"><span style={{ width: `${Math.min(100, film.progress * 100)}%` }} /></span> : null}
      </button>
      <div className="film-card-meta"><div><strong>{film.title}</strong><small>{film.year || 'Deine Mediathek'} · {film.genre}</small></div><button className={`icon-button save-small ${saved ? 'is-saved' : ''}`} onClick={onSave} aria-label={saved ? 'Aus Merkliste entfernen' : 'Zur Merkliste hinzufügen'}>{saved ? <FiCheck /> : <FiPlus />}</button></div>
    </article>
  )
}

function App() {
  const standaloneMovo = import.meta.env.VITE_MOVO_STANDALONE === '1'
  const [page, setPage] = useState<Page>(standaloneMovo ? 'movo' : 'hub')
  const [catalog, setCatalog] = useState<Film[]>(commonsFilms)
  const [jellyfinFilms, setJellyfinFilms] = useState<Film[]>([])
  const [jellyfin, setJellyfin] = useState<JellyfinStatus>({ connected: false })
  const [server, setServer] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectionMessage, setConnectionMessage] = useState('')
  const [catalogMessage, setCatalogMessage] = useState('')
  const [search, setSearch] = useState('')
  const [activeGenre, setActiveGenre] = useState('Alle')
  const [selected, setSelected] = useState<Film | null>(null)
  const [playing, setPlaying] = useState<Film | null>(null)
  const [playbackError, setPlaybackError] = useState('')
  const [transcoding, setTranscoding] = useState(false)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [activeSeason, setActiveSeason] = useState('')
  const [episodes, setEpisodes] = useState<Film[]>([])
  const [seriesLoading, setSeriesLoading] = useState(false)
  const [seriesError, setSeriesError] = useState('')
  const [watchlist, setWatchlist] = useState<string[]>(() => readStore('cinecloud:watchlist', []))
  const [positions, setPositions] = useState<Record<string, number>>(() => readStore('cinecloud:positions', {}))
  const videoRef = useRef<HTMLVideoElement>(null)
  const filmRailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    loadCommonsFilms().then(films => { if (live) setCatalog(films) }).catch(error => { if (live) setCatalogMessage(error instanceof Error ? error.message : 'Katalog nicht erreichbar.') })
    window.cinecloud?.restoreJellyfin().then(status => { if (live) { setJellyfin(status); if (status.server) setServer(status.server) } })
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!jellyfin.connected || !window.cinecloud) return
    window.cinecloud.getJellyfinFilms().then(setJellyfinFilms).catch(error => setConnectionMessage(error instanceof Error ? error.message : 'Jellyfin-Katalog nicht erreichbar.'))
  }, [jellyfin.connected])

  useEffect(() => saveStore('cinecloud:watchlist', watchlist), [watchlist])
  useEffect(() => saveStore('cinecloud:positions', positions), [positions])

  useEffect(() => {
    if (selected?.mediaType !== 'series' || !window.cinecloud) { setSeasons([]); setActiveSeason(''); setEpisodes([]); return }
    let live = true
    setSeriesLoading(true); setSeriesError(''); setEpisodes([])
    window.cinecloud.getJellyfinSeasons(selected.jellyfinId ?? selected.id.replace(/^jellyfin-/, ''))
      .then(items => { if (live) { setSeasons(items); setActiveSeason(items[0]?.id ?? ''); if (!items.length) setSeriesLoading(false) } })
      .catch(error => { if (live) { setSeriesLoading(false); setSeriesError(error instanceof Error ? error.message : 'Staffeln nicht erreichbar.') } })
    return () => { live = false }
  }, [selected?.id, selected?.mediaType, selected?.jellyfinId])

  useEffect(() => {
    if (selected?.mediaType !== 'series' || !activeSeason || !window.cinecloud) return
    let live = true
    setSeriesLoading(true); setSeriesError('')
    window.cinecloud.getJellyfinEpisodes(selected.jellyfinId ?? selected.id.replace(/^jellyfin-/, ''), activeSeason)
      .then(items => { if (live) { setEpisodes(items); setSeriesLoading(false) } })
      .catch(error => { if (live) { setSeriesLoading(false); setSeriesError(error instanceof Error ? error.message : 'Folgen nicht erreichbar.') } })
    return () => { live = false }
  }, [selected?.id, selected?.mediaType, selected?.jellyfinId, activeSeason])

  const films = useMemo(() => [...jellyfinFilms, ...catalog, upcomingFilm], [jellyfinFilms, catalog])
  const filmById = useMemo(() => new Map(films.map(film => [film.id, film])), [films])
  const savedFilms = watchlist.map(id => filmById.get(id)).filter((film): film is Film => !!film)
  const jellyfinMovies = jellyfinFilms.filter(film => film.mediaType !== 'series')
  const jellyfinSeries = jellyfinFilms.filter(film => film.mediaType === 'series')
  const allGenres = ['Alle', 'Animation', 'Fantasy', 'Sci-Fi', 'Horror', 'Action', 'Film', 'Serie']
  const filtered = films.filter(film => {
    const term = search.trim().toLocaleLowerCase('de')
    const matches = !term || [film.title, film.genre, film.overview].some(value => value.toLocaleLowerCase('de').includes(term))
    return matches && (activeGenre === 'Alle' || (activeGenre === 'Serie' ? film.mediaType === 'series' : film.genre === activeGenre))
  })
  const feature = catalog.find(film => film.id === 'sita-sings-the-blues') ?? catalog[0]

  function toggleWatchlist(id: string) { setWatchlist(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]) }
  function startFilm(film: Film) {
    if (film.mediaType === 'series') { setSelected(film); return }
    if (film.origin === 'external') { if (film.offerUrl) openLink(film.offerUrl); return }
    if (!film.video) { setCatalogMessage('Der Stream ist gerade nicht verfügbar. Bitte später erneut versuchen.'); return }
    setPlaybackError('')
    setTranscoding(false)
    setSelected(null)
    setPlaying(film)
  }
  async function connect() {
    if (!window.cinecloud) { setConnectionMessage('Jellyfin ist in der CineCloud-Desktop-App verfügbar.'); return }
    setConnecting(true); setConnectionMessage('')
    const result = await window.cinecloud.connectJellyfin(server, username, password)
    setConnecting(false)
    setJellyfin(result)
    setConnectionMessage(result.error ?? `Verbunden als ${result.user}.`)
    if (result.connected) setPassword('')
  }
  async function launchWavo() {
    if (!window.cinecloud) { setConnectionMessage('Wavo lässt sich in der CineCloud-Desktop-App starten.'); setPage('settings'); return }
    const result = await window.cinecloud.launchWavo()
    if (!result.ok) { setConnectionMessage(result.message ?? 'Wavo konnte nicht gestartet werden.'); setPage('settings') }
  }
  function openLink(url?: string) { if (!url) return; if (window.cinecloud) void window.cinecloud.openExternal(url); else window.open(url, '_blank', 'noopener,noreferrer') }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage(standaloneMovo ? 'movo' : 'hub')}><span className="brand-symbol">{standaloneMovo ? 'M' : 'C'}<span>·</span></span><span>{standaloneMovo ? 'Movo' : 'CineCloud'}<small>{standaloneMovo ? 'FILME & SERIEN' : 'ENTERTAINMENT HUB'}</small></span></button>
        <div className="nav-label">DEIN SPACE</div>
        <nav aria-label="Hauptnavigation">
          {!standaloneMovo && <button className={page === 'hub' ? 'active' : ''} onClick={() => setPage('hub')}><FiHome /> Übersicht</button>}
          <button className={page === 'movo' ? 'active' : ''} onClick={() => setPage('movo')}><FiFilm /> Movo <span className="nav-dot" /></button>
          <button className={page === 'watchlist' ? 'active' : ''} onClick={() => setPage('watchlist')}><FiHeart /> Merkliste <small>{watchlist.length || ''}</small></button>
        </nav>
        {!standaloneMovo && <><div className="nav-label apps-label">DEINE APPS</div><button className="app-shortcut" onClick={() => setPage('movo')}><span className="app-icon movo-icon"><FiPlay fill="currentColor" /></span><span>Movo<small>Filme & Serien</small></span></button><button className="app-shortcut" onClick={launchWavo}><span className="app-icon wavo-icon"><FiMusic /></span><span>Wavo<small>Musik hören</small></span><FiArrowRight className="shortcut-arrow" /></button></>}
        <div className="sidebar-bottom"><button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}><FiSettings /> Einstellungen</button><div className="sidebar-footer">{standaloneMovo ? 'MOVO' : 'CINECLOUD'} <span>v0.1</span></div></div>
      </aside>

      <main className="main-panel">
        <header className="topbar"><div className="breadcrumbs"><span>{standaloneMovo ? 'MOVO' : 'CINECLOUD'}</span><span>/</span><strong>{page === 'hub' ? 'Übersicht' : page === 'movo' ? 'Filme' : page === 'watchlist' ? 'Merkliste' : 'Einstellungen'}</strong></div><div className="top-actions"><span className="source-indicator"><i /> {jellyfin.connected ? 'Jellyfin verbunden' : 'Freier Katalog'}</span><button className="avatar" onClick={() => setPage('settings')} aria-label="Einstellungen öffnen">{jellyfin.user?.slice(0, 1).toUpperCase() ?? (standaloneMovo ? 'M' : 'C')}</button></div></header>

        {page === 'hub' && <div className="page-content hub-page"><div className="eyebrow">EINE WELT. DEINE UNTERHALTUNG.</div><h1>Alles, was du liebst.<br /><em>An einem Ort.</em></h1><p className="hub-lead">Filme entdecken, Musik hören und deine eigene Mediathek genießen. Willkommen in deiner CineCloud.</p><div className="hub-app-grid"><button className="hub-app-card hub-movo" onClick={() => setPage('movo')}><span className="hub-card-glow" /><span className="hub-card-tag">JETZT ANSEHEN</span><span className="hub-card-icon"><FiPlay fill="currentColor" /></span><span className="hub-card-bottom"><span><strong>Movo</strong><small>Filme für deinen nächsten Kinoabend</small></span><span className="circle-arrow"><FiArrowRight /></span></span></button><button className="hub-app-card hub-wavo" onClick={launchWavo}><span className="hub-card-glow" /><span className="hub-card-tag">DEIN SOUNDTRACK</span><span className="hub-card-icon"><FiMusic /></span><span className="hub-card-bottom"><span><strong>Wavo</strong><small>Deine Musik. Dein Vibe.</small></span><span className="circle-arrow"><FiArrowRight /></span></span></button></div><div className="hub-lower"><div><span className="eyebrow">CINECLOUD ORIGINALS</span><h2>Dein Abend beginnt hier.</h2><p>Starte mit frei lizenzierten Kurzfilmen oder verbinde deinen Jellyfin-Server für deine persönliche Sammlung.</p><button className="text-link" onClick={() => setPage('movo')}>Movo entdecken <FiArrowRight /></button></div><div className="hub-stats"><strong>{catalog.length}</strong><span>frei verfügbare Filme</span><div /><strong>{jellyfinFilms.length}</strong><span>Filme aus Jellyfin</span></div></div></div>}

        {page === 'movo' && <div className="movo-page"><div className="movo-hero" style={feature?.backdrop ? { backgroundImage: `linear-gradient(90deg, #0b0d12 4%, rgba(11,13,18,.90) 34%, rgba(11,13,18,.2) 100%), linear-gradient(0deg, #0b0d12, transparent 48%), url("${feature.backdrop}")` } : undefined}><div className="hero-content"><span className="eyebrow"><span className="pulse-dot" /> MOVO PREMIERE</span><h1>{feature?.title ?? 'Movo'}</h1><div className="hero-facts"><span className="rating">FREI</span><span>{feature?.year}</span><span>•</span><span>{feature?.runtime}</span><span>•</span><span>{feature?.genre}</span></div><p>{feature?.overview}</p><div className="hero-buttons"><button className="button-primary" onClick={() => feature && startFilm(feature)}><FiPlay fill="currentColor" /> Jetzt ansehen</button><button className="button-glass" onClick={() => feature && setSelected(feature)}><FiInfo /> Mehr Infos</button></div></div><span className="hero-count">01 / {catalog.length.toString().padStart(2, '0')}</span></div>
          <div className="movo-content"><div className="discover-heading"><div><span className="eyebrow">ENTDECKEN</span><h2>Für deinen Filmabend</h2></div><div className="search-box"><FiSearch /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Filme durchsuchen …" aria-label="Filme durchsuchen" />{search && <button onClick={() => setSearch('')} aria-label="Suche löschen"><FiX /></button>}</div></div><div className="genre-row" aria-label="Genre wählen">{allGenres.map(genre => <button key={genre} className={activeGenre === genre ? 'selected' : ''} onClick={() => setActiveGenre(genre)}>{genre}</button>)}</div>
            {!search && activeGenre === 'Alle' && jellyfinSeries.length > 0 && <section className="film-section"><div className="section-title"><div><h3>Deine Serien</h3><span>Staffeln und Folgen aus Jellyfin</span></div></div><div className="film-grid">{jellyfinSeries.slice(0, 12).map(film => <FilmCard key={film.id} film={film} saved={watchlist.includes(film.id)} onSelect={() => setSelected(film)} onSave={() => toggleWatchlist(film.id)} />)}</div></section>}
            {!search && activeGenre === 'Alle' && jellyfinMovies.length > 0 && <section className="film-section"><div className="section-title"><div><h3>Deine Filme</h3><span>Mit Jellyfin verbunden</span></div></div><div className="film-grid">{jellyfinMovies.slice(0, 12).map(film => <FilmCard key={film.id} film={film} saved={watchlist.includes(film.id)} onSelect={() => setSelected(film)} onSave={() => toggleWatchlist(film.id)} />)}</div></section>}
            <section className="film-section"><div className="section-title"><div><h3>{search || activeGenre !== 'Alle' ? 'Suchergebnisse' : 'Frei entdecken'}</h3><span>{search || activeGenre !== 'Alle' ? `${filtered.length} Titel gefunden` : 'Open Movies mit Lizenzangaben'}</span></div>{!search && activeGenre === 'Alle' && <div className="rail-controls"><button onClick={() => filmRailRef.current?.scrollBy({ left: -650, behavior: 'smooth' })} aria-label="Nach links"><FiArrowLeft /></button><button onClick={() => filmRailRef.current?.scrollBy({ left: 650, behavior: 'smooth' })} aria-label="Nach rechts"><FiArrowRight /></button></div>}</div><div className={search || activeGenre !== 'Alle' ? 'film-grid' : 'film-rail'} ref={filmRailRef}>{(search || activeGenre !== 'Alle' ? filtered : catalog).map(film => <FilmCard key={film.id} film={film} saved={watchlist.includes(film.id)} onSelect={() => setSelected(film)} onSave={() => toggleWatchlist(film.id)} />)}</div>{filtered.length === 0 && <div className="empty-state"><FiCompass /><strong>Hier ist noch nichts zu sehen.</strong><span>Versuche einen anderen Suchbegriff oder ein anderes Genre.</span></div>}</section>
            {!search && activeGenre === 'Alle' && <section className="film-section"><div className="section-title"><div><h3>Aktuelle Titel</h3><span>Offizielle Angebote ansehen</span></div></div><div className="featured-offer"><div className="offer-art"><FiFilm /></div><div><span className="eyebrow">IM FOKUS</span><h3>{upcomingFilm.title}</h3><p>{upcomingFilm.overview}</p><button className="text-link" onClick={() => setSelected(upcomingFilm)}>Verfügbarkeit prüfen <FiArrowRight /></button></div></div></section>}
            {catalogMessage && <div className="notice">{catalogMessage}</div>}<div className="source-note">Freie Filme: Wikimedia Commons. Lizenz und Urheber findest du auf jeder Filmseite.</div></div></div>}

        {page === 'watchlist' && <div className="page-content list-page"><span className="eyebrow">DEINE AUSWAHL</span><h1>Merkliste<span>.</span></h1><p>Die Filme, die du später ansehen möchtest.</p>{savedFilms.length ? <div className="film-grid">{savedFilms.map(film => <FilmCard key={film.id} film={film} saved onSelect={() => setSelected(film)} onSave={() => toggleWatchlist(film.id)} />)}</div> : <div className="empty-state large"><FiHeart /><strong>Deine Merkliste ist noch leer.</strong><span>Entdecke Filme in Movo und speichere deine Favoriten.</span><button className="button-primary" onClick={() => setPage('movo')}>Filme entdecken <FiArrowRight /></button></div>}</div>}

        {page === 'settings' && <div className="page-content settings-page"><span className="eyebrow">DEIN SETUP</span><h1>Einstellungen<span>.</span></h1><p>Verbinde deine eigene Mediathek und verwalte deine Apps.</p><section className="settings-card"><div className="settings-icon"><FiFilm /></div><div className="settings-copy"><h2>Jellyfin verbinden</h2><p>Filme und Serien von deinem Jellyfin-Server werden direkt in Movo angezeigt. Die Anmeldung bleibt auf diesem Gerät.</p>{jellyfin.connected ? <div className="connected-row"><span><FiCheck /> Verbunden als <strong>{jellyfin.user}</strong> · {jellyfin.server}</span><button onClick={async () => { await window.cinecloud?.disconnectJellyfin(); setJellyfin({ connected: false }); setJellyfinFilms([]); setConnectionMessage('Jellyfin getrennt.') }}>Trennen</button></div> : <form onSubmit={event => { event.preventDefault(); void connect() }}><label>SERVERADRESSE<input type="url" value={server} onChange={event => setServer(event.target.value)} placeholder="http://192.168.1.10:8096" required /></label><div className="form-row"><label>BENUTZERNAME<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required /></label><label>PASSWORT<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label></div><button className="button-primary" disabled={connecting}>{connecting ? 'Verbinde …' : 'Mit Jellyfin verbinden'} <FiArrowRight /></button></form>}{connectionMessage && <div className="notice">{connectionMessage}</div>}</div></section>{!standaloneMovo && <section className="settings-card compact"><div className="settings-icon purple"><FiMusic /></div><div className="settings-copy"><h2>Wavo</h2><p>Öffne deine Musik-App direkt aus CineCloud.</p><button className="button-glass" onClick={launchWavo}>Wavo starten <FiArrowRight /></button></div></section>}<div className="settings-footnote">Jellyfin ist freie Server-Software für deine eigene Mediensammlung. Der freie Startkatalog kommt von Wikimedia Commons.</div></div>}
      </main>

      {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
        <div className="detail-modal" role="dialog" aria-modal="true" aria-label={selected.title} onMouseDown={event => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setSelected(null)} aria-label="Schließen"><FiX /></button>
          <div className="detail-art"><FilmArtwork film={selected} /></div>
          <div className="detail-body">
            <span className="eyebrow">{selected.mediaType === 'series' ? 'DEINE SERIE' : selected.origin === 'commons' ? 'FREIER FILM' : selected.origin === 'jellyfin' ? 'DEINE MEDIATHEK' : 'OFFIZIELLES ANGEBOT'}</span>
            <h2>{selected.title}</h2>
            <div className="hero-facts"><span>{selected.year || (selected.mediaType === 'series' ? 'Serie' : 'Film')}</span><span>•</span><span>{selected.runtime}</span><span>•</span><span>{selected.genre}</span></div>
            <p>{selected.overview}</p>
            <div className="detail-actions">
              {selected.mediaType === 'series'
                ? <button className="button-primary" disabled={!episodes.length} onClick={() => episodes[0] && startFilm(episodes[0])}><FiPlay fill="currentColor" /> Erste Folge ansehen</button>
                : <button className="button-primary" onClick={() => startFilm(selected)}>{selected.origin === 'external' ? 'Offizielle Angebote' : 'Jetzt ansehen'} <FiArrowRight /></button>}
              <button className="button-round" onClick={() => toggleWatchlist(selected.id)} aria-label="Merkliste">{watchlist.includes(selected.id) ? <FiCheck /> : <FiPlus />}</button>
            </div>
            {selected.mediaType === 'series' && <section className="series-section">
              <h3>Staffeln & Folgen</h3>
              <div className="season-tabs" role="tablist" aria-label="Staffel wählen">{seasons.map(season => <button key={season.id} role="tab" aria-selected={activeSeason === season.id} className={activeSeason === season.id ? 'active' : ''} onClick={() => { setActiveSeason(season.id); setEpisodes([]) }}>{season.name}</button>)}</div>
              {seriesLoading && <p className="series-note">Folgen werden geladen …</p>}
              {seriesError && <div className="notice">{seriesError}</div>}
              {!seriesLoading && !seriesError && !episodes.length && <p className="series-note">Für diese Staffel sind keine Folgen verfügbar.</p>}
              <div className="episode-list">{episodes.map(episode => <button className="episode-item" key={episode.id} onClick={() => startFilm(episode)}><span className="episode-number">{episode.episodeNumber ?? '•'}</span><span className="episode-copy"><strong>{episode.title}</strong><small>{episode.runtime}{episode.overview ? ` · ${episode.overview}` : ''}</small></span><FiPlay /></button>)}</div>
            </section>}
            {selected.origin === 'commons' && <div className="license-box"><strong>Quelle & Lizenz</strong><span>{selected.creator} · {selected.license ?? 'Lizenz auf Wikimedia Commons prüfen'}</span><button onClick={() => openLink(selected.sourcePage)}>Originaldatei & vollständige Attribution <FiArrowRight /></button>{selected.licenseUrl && <button onClick={() => openLink(selected.licenseUrl)}>Lizenzbedingungen <FiArrowRight /></button>}</div>}
            {selected.origin === 'jellyfin' && <div className="license-box"><strong>Jellyfin</strong><span>Wiedergabe von deinem verbundenen Server.</span></div>}
          </div>
        </div>
      </div>}

      {playing && <div className="player-overlay" role="dialog" aria-modal="true" aria-label={`${playing.title} abspielen`}>
        <div className="player-top"><button onClick={() => { setPlaying(null); setPlaybackError(''); setTranscoding(false) }}><FiArrowLeft /> Zurück</button><div><span>DU SIEHST</span><strong>{playing.seriesName ? `${playing.seriesName} · ${playing.title}` : playing.title}</strong></div><span className="player-badge">MOVO</span></div>
        <div className="video-wrap">
          <video key={`${playing.id}-${transcoding ? 'transcode' : 'direct'}`} ref={videoRef} src={transcoding && playing.jellyfinId ? `movo-media://jellyfin/transcode/${playing.jellyfinId}` : playing.video} controls autoPlay playsInline
            onLoadedMetadata={event => { const video = event.currentTarget; const position = positions[playing.id]; if (position && position < video.duration - 15) video.currentTime = position }}
            onTimeUpdate={event => { const video = event.currentTarget; if (Math.floor(video.currentTime) % 5 === 0) setPositions(current => Math.abs((current[playing.id] ?? 0) - video.currentTime) >= 4 ? { ...current, [playing.id]: video.currentTime } : current) }}
            onError={() => { if (playing.origin === 'jellyfin' && !transcoding && playing.jellyfinId) { setTranscoding(true); return } setPlaybackError('Das Video kann gerade nicht abgespielt werden. Prüfe die Datei und die Transkodierung auf deinem Jellyfin-Server.') }} />
          {playbackError && <div className="playback-error"><FiInfo /><strong>Wiedergabe nicht möglich</strong><span>{playbackError}</span>{playing.origin === 'jellyfin' && <button className="button-primary" onClick={() => openLink(jellyfin.server)}>Jellyfin öffnen <FiArrowRight /></button>}</div>}
        </div>
        <div className="player-bottom"><span>{playing.origin === 'commons' ? `${playing.creator} · ${playing.license ?? 'Wikimedia Commons'}` : transcoding ? 'Jellyfin · optimierte Wiedergabe' : 'Deine Jellyfin-Mediathek'}</span><button onClick={() => videoRef.current?.requestFullscreen()}><FiMaximize2 /> Vollbild</button></div>
      </div>}
    </div>
  )
}

export default App
