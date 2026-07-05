import { Modal } from '@/components/ui/Modal'
import { PostApplicationForm } from '@/components/forms/PostApplicationForm'

export function NewApplicationModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  return (
    <Modal title="New Post Application" onClose={onClose}>
      <PostApplicationForm onSubmitted={onCreated} />
    </Modal>
  )
}
