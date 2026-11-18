import { useEffect } from 'react'
import { Icon } from '../../lib/Icon'

/** Foto a tutto schermo. Il tasto Indietro di Android la chiude (una voce di cronologia solo mentre è aperta). */
export function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    history.pushState({ notePhoto: true }, '')
    const onPop = () => onClose()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (history.state?.notePhoto) history.back()
    }
  }, [onClose])

  return (
    <div className="note-viewer" role="dialog" aria-modal="true" aria-label="Foto della nota" onClick={() => history.back()}>
      <img src={url} alt="Foto della nota" />
      <button className="ui-btn" onClick={() => history.back()}><Icon name="close" /> Chiudi</button>
    </div>
  )
}
