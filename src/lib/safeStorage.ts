// src/lib/safeStorage.ts
//
// Root cause this exists to prevent: supabase-js's auth client reads/writes
// localStorage directly by default. iOS Safari, when this app is embedded
// in a cross-origin, sandboxed iframe (e.g. a Wix page), can throw a
// SecurityError the moment localStorage is even touched — not just on
// write, on *any* access. That throw happens synchronously during
// createClient()'s own initialization, which runs at module-load time,
// before React ever gets a chance to render anything. The result is a
// truly blank page: the iframe itself loads fine, the script inside just
// dies before painting a single pixel.
//
// The fix: never let supabase-js touch window.localStorage directly.
// Everything goes through this adapter instead, which tests real storage
// access up front (in a try/catch) and transparently falls back to an
// in-memory store if it's unavailable. The app still works for the
// current page view either way — sessions just won't persist across a
// reload in the degraded case, which is a far better trade than a blank
// screen.

function isInIframe(): boolean {
  try {
    // window.top itself can throw a SecurityError when accessed
    // cross-origin in some sandboxed contexts — the comparison must be
    // inside the try, not just assumed safe.
    return window.self !== window.top
  } catch {
    // If we can't even ask the question, we're definitely in some kind of
    // restricted cross-origin frame — treat that as "yes, an iframe."
    return true
  }
}

function testRealStorageAccess(storage: Storage): boolean {
  const testKey = '__cvoa_storage_test__'
  try {
    storage.setItem(testKey, '1')
    storage.getItem(testKey)
    storage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

// A minimal Storage-shaped in-memory fallback — enough for supabase-js's
// GoTrueClient, which only ever calls getItem/setItem/removeItem.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

export interface StorageDiagnostics {
  inIframe: boolean
  localStorageAvailable: boolean
  usingFallback: boolean
}

// Runs once, up front, and never throws — everything inside is guarded.
export function createSafeStorage(): { storage: Storage; diagnostics: StorageDiagnostics } {
  const inIframe = isInIframe()
  console.log('[CVOA init] iframe detection:', inIframe ? 'running inside an iframe' : 'top-level window')

  let localStorageAvailable = false
  try {
    localStorageAvailable = typeof window !== 'undefined' && !!window.localStorage && testRealStorageAccess(window.localStorage)
  } catch (err) {
    console.warn('[CVOA init] localStorage access threw during availability check:', err)
    localStorageAvailable = false
  }

  console.log('[CVOA init] localStorage availability:', localStorageAvailable ? 'available' : 'blocked/unavailable')

  if (localStorageAvailable) {
    return { storage: window.localStorage, diagnostics: { inIframe, localStorageAvailable: true, usingFallback: false } }
  }

  console.warn(
    '[CVOA init] Falling back to in-memory storage — sessions will not persist across a reload in this context ' +
      '(expected when embedded in a cross-origin sandboxed iframe with storage restrictions, e.g. iOS Safari).'
  )
  return { storage: createMemoryStorage(), diagnostics: { inIframe, localStorageAvailable: false, usingFallback: true } }
}
