import { StatusBadge } from '@/components/ui/StatusBadge'
import type { MembershipPayment, MembershipType } from '@/lib/types'

export type PaymentSummary = Pick<MembershipPayment, 'id' | 'membership_type' | 'amount' | 'status' | 'paid_at' | 'created_at'>
export const paymentSummaryColumns = 'id,membership_type,amount,status,paid_at,created_at'

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

export function membershipPlan(type: MembershipType) {
  return type === 'lifetime' ? 'Lifetime membership' : 'Annual membership'
}

export function paymentAmount(amount: number) {
  return dollars.format(amount)
}

export function paymentDate(value: string) {
  return date.format(new Date(value))
}

export function PaymentStatus({ status }: { status: PaymentSummary['status'] }) {
  if (status === 'paid') return <StatusBadge label="Paid" tone="active" />
  if (status === 'pending') return <StatusBadge label="Not confirmed" tone="developing" />
  return <StatusBadge label={status} tone="attention" />
}
