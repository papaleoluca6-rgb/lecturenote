// Icone SVG a tratto (disegni di Lucide, licenza ISC, gratuita): niente emoji, stesso stile ovunque.
// Decorative di default (aria-hidden): il bottone che le contiene deve avere testo o aria-label.

const P = {
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z|M19 10v2a7 7 0 0 1-14 0v-2|M12 19v3',
  pause: 'M8 4h1a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z|M15 4h1a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z',
  play: 'M6 3l14 9-14 9V3Z',
  stop: 'M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  back: 'm12 19-7-7 7-7|M19 12H5',
  prev: 'm15 18-6-6 6-6',
  next: 'm9 18 6-6-6-6',
  settings: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z|M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  plus: 'M5 12h14|M12 5v14',
  trash: 'M3 6h18|M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6|M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2',
  edit: 'M12 20h9|M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.85Z',
  search: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z|m21 21-4.3-4.3',
  camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z|M12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|m17 8-5-5-5 5|M12 3v12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|m7 10 5 5 5-5|M12 15V3',
  highlighter: 'm9 11-6 6v3h9l3-3|m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
  eraser: 'm7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21|M22 21H7|m5 11 9 9',
  undo: 'M3 7v6h6|M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13',
  hand: 'M18 11V6a2 2 0 0 0-4 0|M14 10V4a2 2 0 0 0-4 0v2|M10 10.5V6a2 2 0 0 0-4 0v8|M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  translate: 'm5 8 6 6|m4 14 6-6 2-3|M2 5h12|M7 2h1|m22 22-5-10-5 10|M14 18h6',
  book: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z|M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z',
  sparkles: 'M9.94 15.5a2 2 0 0 0-1.44-1.44l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0L14.06 8.5a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0Z',
  close: 'M18 6 6 18|m6 6 12 12',
  check: 'M20 6 9 17l-5-5',
  slides: 'M2 3h20|M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3|m7 21 5-5 5 5',
  pen: 'M12 20h9|M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.85Z',
  note: 'M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z|M15 3v4a2 2 0 0 0 2 2h4',
  flask: 'M10 2v7.31|M14 9.3V2|M8.5 2h7|M14 9.3a6.5 6.5 0 1 1-4 0',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z|M12 6v6l4 2',
  cards: 'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z|M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
  refresh: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8|M21 3v5h-5',
  captions: 'M7 13h4|M15 13h2|M7 9h2|M13 9h4|M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z',
  folder: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
  wave: 'M2 10v3|M6 6v11|M10 3v18|M14 8v7|M18 5v13|M22 10v3',
  redo: 'M21 7v6h-6|M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7',
  expand: 'M15 3h6v6|M9 21H3v-6|M21 3l-7 7|M3 21l7-7',
  shrink: 'M4 14h6v6|M20 10h-6V4|M14 10l7-7|M3 21l7-7',
  grid: 'M3 3h7v7H3Z|M14 3h7v7h-7Z|M14 14h7v7h-7Z|M3 14h7v7H3Z',
  share: 'M18 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z|M6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z|M18 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z|m8.6 13.5 6.8 4|m15.4 6.5-6.8 4',
  export: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z|M14 2v6h6|M12 18v-6|m9 15 3 3 3-3',
} as const

export type IconName = keyof typeof P

export function Icon({ name, size = 20, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {P[name].split('|').map((d) => <path key={d} d={d} />)}
    </svg>
  )
}
