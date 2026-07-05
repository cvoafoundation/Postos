// A minimal stand-in for @supabase/supabase-js, used only when no real
// Supabase project is configured (see lib/supabase.ts). It implements just
// enough of the chainable query builder + auth API for this app's call
// patterns. Swapping back to a real project requires no code changes —
// only setting real env vars — because the two clients share a shape.

import { DEMO_USER_ID, seedData } from './mockData'

function assignSponsorTier(row: Row) {
  const tiers = (seedData.sponsor_tiers ?? []) as Row[]
  const eligible = tiers
    .filter((t) => t.min_value <= (row.sponsorship_value ?? 0))
    .sort((a, b) => b.min_value - a.min_value)
  row.tier_id = eligible[0]?.id ?? null
}

type Row = Record<string, any>

function uid() {
  return 'demo-' + Math.random().toString(36).slice(2, 10)
}

function matches(row: Row, filters: { type: string; col: string; value: any }[]) {
  return filters.every((f) => {
    if (f.type === 'eq') return row[f.col] === f.value
    if (f.type === 'in') return (f.value as any[]).includes(row[f.col])
    return true
  })
}

class QueryBuilder {
  private table: string
  private filters: { type: string; col: string; value: any }[] = []
  private orderCol: string | null = null
  private orderAsc = true
  private limitN: number | null = null
  private wantSingle = false
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | null = null
  private countMode: 'exact' | null = null
  private headOnly = false

  constructor(table: string) {
    this.table = table
    if (!seedData[table]) seedData[table] = []
  }

  select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
    if (this.op === 'select') {
      if (opts?.count) this.countMode = opts.count
      if (opts?.head) this.headOnly = true
    }
    return this
  }

  eq(col: string, value: any) {
    this.filters.push({ type: 'eq', col, value })
    return this
  }

  in(col: string, value: any[]) {
    this.filters.push({ type: 'in', col, value })
    return this
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col
    this.orderAsc = opts?.ascending ?? true
    return this
  }

  limit(n: number) {
    this.limitN = n
    return this
  }

  single() {
    this.wantSingle = true
    return this
  }

  insert(payload: Row) {
    this.op = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Row) {
    this.op = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.op = 'delete'
    return this
  }

  private run() {
    const store = seedData[this.table]

    if (this.op === 'insert') {
      const row = { id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...this.payload }
      if (this.table === 'sponsors') assignSponsorTier(row)
      store.push(row)
      return { data: [row], error: null, count: null }
    }

    let rows = store.filter((r) => matches(r, this.filters))

    if (this.op === 'update') {
      rows.forEach((r) => {
        Object.assign(r, this.payload)
        if (this.table === 'sponsors' && this.payload && 'sponsorship_value' in this.payload) {
          assignSponsorTier(r)
        }
        if (this.table === 'founding_team_members') {
          if (r.dd214_reviewed && r.combat_service_verified && r.membership_approved) {
            r.verification_status = 'verified'
          } else if (r.verification_status === 'verified') {
            r.verification_status = 'pending'
          }
        }
      })
      return { data: rows, error: null, count: null }
    }

    if (this.op === 'delete') {
      const removed = new Set(rows.map((r) => r.id))
      seedData[this.table] = store.filter((r) => !removed.has(r.id))
      return { data: rows, error: null, count: null }
    }

    // select
    if (this.countMode) {
      return { data: this.headOnly ? null : rows, error: null, count: rows.length }
    }

    if (this.orderCol) {
      const col = this.orderCol
      rows = [...rows].sort((a, b) => {
        const av = a[col]
        const bv = b[col]
        if (av === bv) return 0
        return (av > bv ? 1 : -1) * (this.orderAsc ? 1 : -1)
      })
    }

    if (this.limitN != null) rows = rows.slice(0, this.limitN)

    if (this.wantSingle) {
      return { data: rows[0] ?? null, error: null, count: null }
    }

    return { data: rows, error: null, count: null }
  }

  then(resolve: (value: any) => void, reject?: (reason: any) => void) {
    try {
      resolve(this.run())
    } catch (e) {
      if (reject) reject(e)
    }
  }
}

let authListener: ((event: string, session: any) => void) | null = null

const demoSession = {
  user: { id: DEMO_USER_ID, email: 'commander@cvoa.org' },
}

export const mockSupabase = {
  from(table: string) {
    return new QueryBuilder(table)
  },
  storage: {
    from(_bucket: string) {
      return {
        async upload(path: string, _file: File) {
          // Demo mode doesn't persist real files — just simulates success
          // so the upload-gated form flow can be exercised end to end.
          await new Promise((r) => setTimeout(r, 400))
          return { data: { path }, error: null }
        },
        async createSignedUrl(path: string, _expiresIn: number) {
          return { data: { signedUrl: `#demo-file/${path}` }, error: null }
        },
      }
    },
  },
  auth: {
    async getSession() {
      return { data: { session: demoSession } }
    },
    onAuthStateChange(cb: (event: string, session: any) => void) {
      authListener = cb
      // Fire immediately so consumers relying on the callback still get the demo session.
      setTimeout(() => cb('SIGNED_IN', demoSession), 0)
      return { data: { subscription: { unsubscribe: () => { authListener = null } } } }
    },
    async signInWithPassword(_creds: { email: string; password: string }) {
      authListener?.('SIGNED_IN', demoSession)
      return { data: { session: demoSession }, error: null }
    },
    async signOut() {
      authListener?.('SIGNED_OUT', null)
      return { error: null }
    },
  },
}
