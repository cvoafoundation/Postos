import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { useMemo, useState } from 'react'
import type { Post } from '@/lib/types'

// Bundled at build time — no runtime network fetch required.
import usStates from 'us-atlas/states-10m.json?url'

const STATUS_COLOR: Record<string, string> = {
  green: '#4A7C59',
  yellow: '#C9A227',
  red: '#A3423D',
}

// FIPS state code -> USPS abbreviation, used to match posts.state to map geographies.
const FIPS_TO_ABBR: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
  '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL',
  '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
  '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
  '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
  '55': 'WI', '56': 'WY',
}

export function UsStatusMap({ posts }: { posts: Post[] }) {
  const [hovered, setHovered] = useState<string | null>(null)

  const stateStatus = useMemo(() => {
    const map: Record<string, { status: string; count: number }> = {}
    for (const post of posts) {
      const existing = map[post.state]
      const rank = { red: 3, yellow: 2, green: 1 } as Record<string, number>
      if (!existing || rank[post.health_status] > rank[existing.status]) {
        map[post.state] = { status: post.health_status, count: (existing?.count ?? 0) + 1 }
      } else {
        existing.count += 1
      }
    }
    return map
  }, [posts])

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="eyebrow">Post Status — National Map</div>
        <div className="flex items-center gap-4 text-[11px] font-mono uppercase">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR.green }} /> Active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR.yellow }} /> Developing
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR.red }} /> Needs Attention
          </span>
        </div>
      </div>

      <ComposableMap projection="geoAlbersUsa" className="w-full h-auto" style={{ maxHeight: 420 }}>
        <Geographies geography={usStates}>
          {({ geographies }: { geographies: any[] }) =>
            geographies.map((geo) => {
              const abbr = FIPS_TO_ABBR[geo.id as string]
              const entry = abbr ? stateStatus[abbr] : undefined
              const fill = entry ? STATUS_COLOR[entry.status] : '#26272B'
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={() => setHovered(abbr ? `${abbr} — ${entry?.count ?? 0} post(s)` : null)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    default: { fill, stroke: '#0A0A0B', strokeWidth: 0.75, outline: 'none' },
                    hover: { fill: '#E8C468', stroke: '#0A0A0B', strokeWidth: 0.75, outline: 'none' },
                    pressed: { fill: '#E8C468', outline: 'none' },
                  }}
                />
              )
            })
          }
        </Geographies>
      </ComposableMap>

      <div className="h-5 text-center font-mono text-xs text-muted">{hovered ?? ' '}</div>
    </div>
  )
}
