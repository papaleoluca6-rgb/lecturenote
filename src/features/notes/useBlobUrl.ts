import { useEffect, useRef, useState } from 'react'

/** Object URL per il Blob di un record, revocato quando cambia `key` o il componente sparisce. */
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
