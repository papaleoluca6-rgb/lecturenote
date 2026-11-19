import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles/global.css'

// Senza questa richiesta Chrome può cancellare tutti i dati dell'app (lezioni, audio, slide) quando il tablet è a corto di spazio.
void navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
