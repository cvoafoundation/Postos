import PersonWorkspace from '@/components/access/PersonWorkspace'
import type { Member } from '@/lib/types'
export default function MemberRecord({ member }: {member:Member}) {
 return <PersonWorkspace memberId={member.id} />
}
