import type { ExportFile } from './notebooklm'

// Condivisione e download dei file esportati.

export function canShare(files: File[]): boolean {
  try {
    return !!navigator.canShare?.({ files })
  } catch {
    return false
  }
}

export const canShareFiles = () => canShare([new File(['x'], 'a.txt', { type: 'text/plain' })])

/** Scarica i file uno dopo l'altro. Va chiamata subito dopo un tocco: senza, Chrome blocca i download multipli. */
export async function download(files: ExportFile[]): Promise<void> {
  for (const f of files) {
    const url = URL.createObjectURL(f.file)
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    await new Promise((r) => setTimeout(r, 500))
  }
}

const isAudio = (f: ExportFile) => f.file.type.startsWith('audio/')
export const filesLabel = (files: ExportFile[]) => `${files.length} file${files.every(isAudio) ? ' audio' : ''}`
/** Chrome può chiedere il permesso per più download: non si sa se l'utente lo concede, quindi niente "salvati". */
export const startedNotice = (files: ExportFile[]) => files.length === 1
  ? 'Download avviato: lo trovi nella cartella Download.'
  : `Download avviato per ${filesLabel(files)}: se Chrome chiede di consentire più download, tocca «Consenti». Li trovi nella cartella Download.`
