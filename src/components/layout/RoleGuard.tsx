import type { ReactNode } from 'react'
import { useAuth } from '@/context/AuthContext'
import type { UserRole } from '@/lib/types'

export function RoleGuard({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { hasRole, isNational, loading } = useAuth()

  if (loading) return null

  if (isNational || hasRole(...roles)) return <>{children}</>

  return (
    <div className="panel p-8 text-center">
      <div className="eyebrow mb-2">Access Restricted</div>
      <p className="text-sm text-muted">
        Your role does not have access to this module. Contact your Post Commander or National Staff if you
        believe this is an error.
      </p>
    </div>
  )
}
