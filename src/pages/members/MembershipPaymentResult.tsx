import { useSearchParams, useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'

export default function MembershipPaymentResult() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const success = searchParams.get('status') === 'success'

  return (
    <div className="min-h-screen bg-base px-4 py-16 flex items-start justify-center">
      <div className="w-full max-w-md text-center">
        <img src="/images/cvoa-logo.png" alt="CVOA" className="w-20 h-20 mx-auto mb-8" />
        <div className="panel p-8">
          {success ? (
            <>
              <CheckCircle2 className="mx-auto mb-4 text-status-active" size={44} />
              <div className="font-display text-2xl tracking-wide mb-2">Payment Received</div>
              <p className="text-sm text-muted mb-6">
                Your membership is active. If you created an account, log in now to see your digital membership
                card.
              </p>
              <button onClick={() => navigate('/?login=true')} className="btn-gold w-full">
                Log In to Your Account
              </button>
            </>
          ) : (
            <>
              <XCircle className="mx-auto mb-4 text-status-attention" size={44} />
              <div className="font-display text-2xl tracking-wide mb-2">Payment Not Completed</div>
              <p className="text-sm text-muted">
                Checkout was cancelled and you weren't charged. You can try again anytime using the same link.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
