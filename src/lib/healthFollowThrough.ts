import type { PostHealthResult } from './postHealth'

const responsibilities: Record<string, string> = {
  officers: 'Company Commander',
  meetings: 'Company Adjutant or meeting secretary',
  membership: 'Company membership staff',
  sponsors: 'Company sponsorship lead',
  congress: 'Congressional delegate',
  governance: 'Company leadership',
  annual_review: 'Company leadership and reviewing authority',
  community_service: 'Company leadership',
  financial: 'Company Quartermaster or finance lead',
}

export function topHealthIntervention(result: PostHealthResult) {
  const dimension = result.dimensions.find(d => d.status === 'red' && result.critical.includes(d.label))
    ?? result.dimensions.find(d => d.status === 'red')
    ?? result.dimensions.find(d => d.status === 'yellow')
  return dimension ? { ...dimension, responsibility: responsibilities[dimension.key] ?? 'Company leadership' } : null
}
