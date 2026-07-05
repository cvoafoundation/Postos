import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { POST_STATUS_LABELS, type PostApplication } from '@/lib/types'
import { format } from 'date-fns'

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div className="text-sm text-ink whitespace-pre-wrap">
        {value === null || value === undefined || value === '' ? (
          <span className="text-muted">—</span>
        ) : (
          value
        )}
      </div>
    </div>
  )
}

export function ApplicationDetailModal({
  application,
  onClose,
}: {
  application: PostApplication
  onClose: () => void
}) {
  return (
    <Modal title={application.name} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <StatusBadge label={POST_STATUS_LABELS[application.status]} tone="developing" />
          <span className="font-mono text-[11px] text-muted">
            Submitted {format(new Date(application.created_at), 'MMM d, yyyy')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" value={application.email} />
          <Field label="Phone" value={application.phone} />
          <Field label="Location" value={[application.city, application.state].filter(Boolean).join(', ')} />
          <Field label="Military Branch" value={application.military_branch} />
          <Field label="Years Served" value={application.years_served} />
          <Field label="Combat Service" value={application.combat_service ? 'Yes' : 'No'} />
        </div>

        <div className="border-t border-hairline pt-4 space-y-4">
          <Field label="Leadership Experience" value={application.leadership_experience} />
          <Field label="Existing Veteran Network" value={application.existing_veteran_network} />
          <Field label="Estimated Membership Potential" value={application.estimated_membership_potential} />
          <Field label="Why do you want to start a post?" value={application.motivation} />
        </div>

        <div className="border-t border-hairline pt-4">
          <Field
            label="DD214 Status"
            value={application.dd214_storage_path ? application.dd214_review_status : 'Not uploaded'}
          />
        </div>
      </div>
    </Modal>
  )
}
