import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Newsreader (OFL-1.1), the design system's open fallback for the licensed Plantin (ADR 0008).
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
