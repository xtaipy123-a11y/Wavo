import type { Film } from './types'

export const commonsFilms: Film[] = [
  { id: 'sita-sings-the-blues', title: 'Sita Sings the Blues', year: 2008, genre: 'Animation', runtime: '82 Min.', overview: 'Eine farbenfrohe, musikalische Neuerzählung des Ramayana und einer modernen Liebesgeschichte.', origin: 'commons', fileTitle: 'File:Sita Sings the Blues.webm', creator: 'Nina Paley' },
  { id: 'sintel', title: 'Sintel', year: 2010, genre: 'Fantasy', runtime: '15 Min.', overview: 'Eine junge Frau begibt sich auf eine bewegende Suche nach einem Drachen, den sie einst gerettet hat.', origin: 'commons', fileTitle: 'File:Sintel movie 4K.webm', creator: 'Blender Foundation' },
  { id: 'big-buck-bunny', title: 'Big Buck Bunny', year: 2008, genre: 'Animation', runtime: '10 Min.', overview: 'Ein gutmütiger Hase zeigt drei frechen Waldbewohnern, dass Freundlichkeit ihre Grenzen hat.', origin: 'commons', fileTitle: 'File:Big Buck Bunny 4K.webm', creator: 'Blender Foundation' },
  { id: 'tears-of-steel', title: 'Tears of Steel', year: 2012, genre: 'Sci-Fi', runtime: '12 Min.', overview: 'In einem futuristischen Amsterdam trifft eine alte Liebe auf eine Bedrohung durch Maschinen.', origin: 'commons', fileTitle: 'File:Tears of Steel 1080p.webm', creator: 'Blender Foundation' },
  { id: 'elephants-dream', title: 'Elephants Dream', year: 2006, genre: 'Fantasy', runtime: '11 Min.', overview: 'Zwei Figuren wandern durch eine rätselhafte Maschinenwelt voller surrealer Bilder.', origin: 'commons', fileTitle: 'File:Elephants Dream(HQ).webm', creator: 'Blender Foundation' },
  { id: 'cosmos-laundromat', title: 'Cosmos Laundromat', year: 2015, genre: 'Animation', runtime: '12 Min.', overview: 'Ein Schaf auf einer einsamen Insel erhält ein unerwartetes Angebot.', origin: 'commons', fileTitle: 'File:Cosmos Laundromat - First Cycle - Official Blender Foundation release.webm', creator: 'Blender Foundation' },
  { id: 'sprite-fright', title: 'Sprite Fright', year: 2021, genre: 'Horror', runtime: '11 Min.', overview: 'Ein Waldtrip entwickelt sich zu einem überraschend wilden Animationsabenteuer.', origin: 'commons', fileTitle: 'File:Sprite Fright - Open Movie by Blender Studio.webm', creator: 'Blender Studio' },
  { id: 'spring', title: 'Spring', year: 2019, genre: 'Fantasy', runtime: '8 Min.', overview: 'Eine junge Hirtin und ihr Hund begegnen uralten Geistern im Wandel der Jahreszeiten.', origin: 'commons', fileTitle: 'File:Spring - Blender Open Movie.webm', creator: 'Blender Studio' },
  { id: 'coffee-run', title: 'Coffee Run', year: 2020, genre: 'Animation', runtime: '3 Min.', overview: 'Ein kurzer, verspielter Trip durch Erinnerungen und eine Tasse Kaffee.', origin: 'commons', fileTitle: 'File:Coffee Run - Blender Open Movie-full movie.webm', creator: 'Blender Studio' },
  { id: 'charge', title: 'Charge', year: 2022, genre: 'Sci-Fi', runtime: '4 Min.', overview: 'Ein Ausbruch aus einer hoch technisierten Anlage wird zur Frage des Überlebens.', origin: 'commons', fileTitle: 'File:Charge - Blender Open Movie-full movie.webm', creator: 'Blender Studio' },
  { id: 'wing-it', title: 'WING IT!', year: 2023, genre: 'Animation', runtime: '4 Min.', overview: 'Ein chaotischer Flugversuch voller Erfindergeist und Tempo.', origin: 'commons', fileTitle: 'File:WING IT! - Blender Open Movie-full movie.webm', creator: 'Blender Studio' },
]

export const upcomingFilm: Film = {
  id: 'brand-new-day', title: 'Spider-Man: Brand New Day', year: 2026, genre: 'Action', runtime: 'Angebot prüfen',
  overview: 'Aktueller Film. Über den offiziellen Anbieter kannst du verfügbare Kauf- und Leihoptionen prüfen.',
  origin: 'external', offerUrl: 'https://www.sonypictures.com/movies/spidermanbrandnewday',
}
