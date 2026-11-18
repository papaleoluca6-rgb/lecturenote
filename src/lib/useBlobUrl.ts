import { useEffect, useRef, useState } from 'react'

/**
 * Object URL per il Blob di un record, revocato quando cambia `key` o il componente sparisce.
 * Si usa l'id del record come chiave: le query live di Dexie restituiscono Blob nuovi a ogni aggiornamento
 * e non si vuole ricreare (e ridecodificare) l'immagine ogni volta.
 */
export function useBlobUrl(key: string | undefined, blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  const blobRef = useRef(blob)
  useEffect(() => {
    blobRef.current = blob
  })
  useEffect(() => {
    const b = blobRef.current
    if (!key || !b) return setUrl(undefined)
    const u = URL.createObjectURL(b)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [key])
  return url
}
