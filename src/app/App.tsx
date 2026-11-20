import { useEffect, useState } from 'react'
import { db, type Id } from '../db/schema'
import { BackupPanel } from '../features/backup/BackupPanel'
import { ExportDialog } from '../features/export/ExportDialog'
import type { ExportTarget } from '../features/export/notebooklm'
import { LibraryScreen } from '../features/library/LibraryScreen'
import { lastOpenLesson, rememberOpenLesson } from '../lib/lessonView'
import { LessonPanels } from './LessonPanels'
import { UpdateBanner } from './UpdateBanner'
import { RecordingScreen } from '../features/recording/RecordingScreen'
import { recordingFlag, setRecordingFlag } from '../features/recording/recordingFlag'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { ProbeScreen } from '../features/translation/probe/ProbeScreen'

const useHash = () => {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return hash
}

export function App() {
  // Se Android ricarica l'app mentre una lezione era aperta, si riapre quella.
  // Segno di registrazione ancora presente: Android ha chiuso l'app a metà lezione, si riapre quella lezione e si avvisa.
  const [interrupted, setInterrupted] = useState<Id | null>(recordingFlag)
  const [lessonId, setLesson] = useState<Id | null>(() => interrupted ?? lastOpenLesson())
  const [exportTarget, setExportTarget] = useState<ExportTarget | null>(null)
  const hash = useHash()
  const openLesson = (id: Id | null) => {
    rememberOpenLesson(id)
    setLesson(id)
    setInterrupted(null)
  }
  // La lezione ricordata potrebbe essere stata eliminata (o era vuota): allora si resta nella libreria.
  useEffect(() => {
    setRecordingFlag(null)
    if (lessonId) rememberOpenLesson(lessonId)
    if (lessonId) void db.lessons.get(lessonId).then((l) => { if (!l) openLesson(null) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const screen =
    hash === '#prova' ? <ProbeScreen onClose={() => (location.hash = '')} />
    : hash === '#impostazioni' ? <SettingsScreen onClose={() => (location.hash = '')}><BackupPanel /></SettingsScreen>
    : null

  if (!lessonId) return screen ?? (
    <>
      <LibraryScreen onOpenLesson={openLesson} onExport={setExportTarget} />
      {exportTarget && <ExportDialog target={exportTarget} onClose={() => setExportTarget(null)} />}
      <UpdateBanner />
    </>
  )
  // Impostazioni aperte dalla lezione: la lezione resta montata (nascosta), tornando è esattamente com'era.
  return (
    <>
      {screen}
      <div style={{ display: screen ? 'none' : 'contents' }}>
        <RecordingScreen
          key={lessonId}
          lessonId={lessonId}
          onClose={() => openLesson(null)}
          notice={interrupted === lessonId ? "Registrazione interrotta: l'app è stata chiusa durante la registrazione. Tocca Continua per riprendere." : undefined}
          panels={(clock) => <LessonPanels lessonId={lessonId} clock={clock} />}
        />
      </div>
    </>
  )
}
