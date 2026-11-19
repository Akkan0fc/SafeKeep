import { useState, type FormEvent } from 'react'
import { ShieldCheck, HandHeart, AlertTriangle, ImagePlus, CheckCircle2, Sparkles } from 'lucide-react'
import { Dialog } from '../../components/Dialog'
import { reportFoundForLostItem, errorMessage } from '../../services/api'
import type { Item, UserProfile } from '../../types'

interface FoundThisItemModalProps {
  lostItem: Item
  user: UserProfile
  onClose: () => void
  onSuccess: () => void
}

export function FoundThisItemModal({
  lostItem,
  user,
  onClose,
  onSuccess,
}: FoundThisItemModalProps) {
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || !answer.trim()) {
      setError('Please provide both a secret question and the expected answer.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await reportFoundForLostItem(lostItem, user, prompt.trim(), answer.trim())
      setDone(true)
      setTimeout(() => {
        onSuccess()
      }, 1400)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      title="I Found This Item!"
      subtitle="Direct match verification"
      onClose={onClose}
    >
      {done ? (
        <div className="claim-success-state">
          <div className="success-icon">
            <CheckCircle2 size={48} />
          </div>
          <h3>Found Confirmation Secured!</h3>
          <p>
            The owner will be challenged with your secret question before any handover chat is unlocked.
          </p>
        </div>
      ) : (
        <form className="form" onSubmit={handleSubmit}>
          {/* Target lost item preview */}
          <div className="found-target-card">
            {lostItem.image_url ? (
              <img
                src={lostItem.image_url}
                alt={lostItem.title}
                className="found-target-thumb"
              />
            ) : (
              <div className="found-target-thumb found-target-thumb-empty">
                <ImagePlus size={22} />
              </div>
            )}
            <div className="found-target-info">
              <span className="pill lost">Lost Report</span>
              <h4>{lostItem.title}</h4>
              <p>
                <span>{lostItem.location || 'Campus'}</span>
                <span>•</span>
                <span>Reported by {lostItem.user_name || 'Student'}</span>
              </p>
            </div>
          </div>

          <div className="claim-note">
            <ShieldCheck size={22} />
            <div>
              <strong>No Duplicate Report Needed</strong>
              <p>
                Since you found this exact lost item, you don't need to re-enter the name, location, date, or photos.
                Just set a secret ownership question to verify the rightful owner!
              </p>
            </div>
          </div>

          <label>
            Secret question for the owner *
            <input
              autoFocus
              required
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. What sticker or charm is on it? / What's inside the front pocket?"
              disabled={submitting}
            />
            <span className="form-hint">
              Ask for an identifying detail that is not visible in the public lost post.
            </span>
          </label>

          <label>
            Expected private answer *
            <input
              required
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="e.g. Yellow Pikachu sticker with red cheeks"
              disabled={submitting}
            />
            <span className="form-hint">
              <Sparkles size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              SafeKeep uses smart fuzzy &amp; semantic relation verification, so minor typos or phrasing differences from the owner won't lock them out.
            </span>
          </label>

          {error && (
            <div className="form-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="dialog-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button"
              disabled={submitting || !prompt.trim() || !answer.trim()}
            >
              <HandHeart size={18} />
              {submitting ? 'Securing Found Item…' : 'Confirm I Found This Item'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
