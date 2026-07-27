import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from '@/context/AuthContext'
import './index.css'

console.log('[CVOA init] main.tsx executing')

// Requirement: uncaught errors and rejected promises must be visible
// somewhere, not silently swallowed into a blank page. These are the
// browser-level catch-alls — they run before/alongside anything React
// itself can catch.
window.addEventListener('error', (event) => {
  console.error('[CVOA init] uncaught error:', event.error ?? event.message, event)
})
window.addEventListener('unhandledrejection', (event) => {
  console.error('[CVOA init] unhandled promise rejection:', event.reason)
})

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[CVOA init] React render error caught by boundary:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      // A real, visible message instead of a blank screen — this is the
      // whole point. Whoever's looking at this (a developer checking
      // console output, or eventually a person seeing it directly) gets
      // the actual failure, not silence.
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0A0A0B',
            color: '#EDEBE4',
            fontFamily: 'monospace',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9A9A93', marginBottom: '8px' }}>
            CVOA.ONE SYSTEM — Initialization Error
          </div>
          <div style={{ fontSize: '14px', maxWidth: '480px' }}>{this.state.error.message}</div>
        </div>
      )
    }
    return this.props.children
  }
}

function renderApp() {
  const rootEl = document.getElementById('root')
  if (!rootEl) {
    console.error('[CVOA init] #root element not found in the DOM — cannot mount the application.')
    return
  }

  try {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </React.StrictMode>
    )
    console.log('[CVOA init] initial render call completed')
  } catch (err) {
    // If React itself fails this early (before any error boundary exists
    // to catch it), fall back to raw DOM so the failure is still visible
    // rather than a silent blank page.
    console.error('[CVOA init] fatal error before React could render:', err)
    rootEl.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0A0A0B;color:#EDEBE4;font-family:monospace;padding:24px;text-align:center;">
        <div style="font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:#9A9A93;margin-bottom:8px;">CVOA.ONE SYSTEM — Initialization Error</div>
        <div style="font-size:14px;max-width:480px;">${err instanceof Error ? err.message : String(err)}</div>
      </div>
    `
  }
}

renderApp()
