import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useAuth } from '@/context/AuthContext'
// Ephemeral, account-and-workspace-specific preferences. No records are cached.
const memory = new Map<string, unknown>()
export function useListMemory<T extends string | number>(name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const { session, selectedScope, profile } = useAuth()
  const key = `${session?.user.id ?? 'signed-out'}:${profile?.role}:${profile?.post_id}:${profile?.state}:${selectedScope}:${name}`
  const read = () => memory.has(key) ? memory.get(key) as T : initial
  const [state, setState] = useState(() => ({ key, value: read() }))
  const value = state.key === key ? state.value : read()
  useEffect(() => {
    if (memory.size > 150) memory.clear()
    memory.set(key, value)
  }, [key, value])
  const setValue: Dispatch<SetStateAction<T>> = update => {
    setState(previous => {
      const current = previous.key === key ? previous.value : read()
      return { key, value: typeof update === 'function' ? update(current) : update }
    })
  }
  return [value, setValue]
}
