import { useEffect, useState } from 'react'
import type { Id } from '../db/schema'
import { BackupPanel } from '../features/backup/BackupPanel'
import { LibraryScreen } from '../features/library/LibraryScreen'
import { LessonPanels } from './LessonPanels'
import { RecordingScreen } from '../features/recording/RecordingScreen'
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
  const [lessonId, setLessonId] = useState<Id | null>(null)
  const hash = useHash()
  if (hash === '#prova') return <ProbeScreen onClose={() => (location.hash = '')} />
  if (hash === '#impostazioni') return <SettingsScreen onClose={() => (location.hash = '')}><BackupPanel /></SettingsScreen>
  return lessonId ? (
    <RecordingScreen
      key={lessonId}
      lessonId={lessonId}
      onClose={() => setLessonId(null)}
      panels={(clock) => <LessonPanels lessonId={lessonId} clock={clock} />}
    />
  ) : (
    <LibraryScreen onOpenLesson={setLessonId} />
  )
}
