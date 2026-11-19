import { useState, useEffect, type FormEvent } from 'react'
import { ShieldCheck, ClipboardCheck, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Dialog } from '../../components/Dialog'
import { startClaim, verifyClaim, errorMessage } from '../../services/api'
import type { Match, ClaimResult } from '../../types'

interface ClaimModalProps {
  match: Match
  onClose: () => void
  onVerified: (result: ClaimResult) => void
}

export function ClaimModal({ match, onClose, onVerified }: ClaimModalProps) {
  const [claimId, setClaimId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<string>('')
  const [answer, setAnswer] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [pending, setPending] = useState<boolean>(false)
  const [loadingPrompt, setLoadingPrompt] = useState<boolean>(true)
  const [attemptsRemaining, setAttemptsRemaining] = useState<number>(3)
  const [isSuccess, setIsSuccess] = useState<boolean>(false)
  const [successResult, setSuccessResult] = useState<ClaimResult | null>(null)

  useEffect(() => {
    let active = true
    startClaim(match.id)
      .then((data) => {
        if (active) {
          setClaimId(data.claim_id)
          setPrompt(data.prompt)
          setLoadingPrompt(false)
        }
      })
      .catch((err) => {
        if (active) {
          setError(errorMessage(err))
          setLoadingPrompt(false)
        }
      })
    return () => {
      active = false
    }
  }, [match.id])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!claimId || !answer.trim()) return

    setPending(true)
    setError('')

    try {
      const result = await verifyClaim(claimId, answer)
      if (result.verified) {
        setIsSuccess(true)
        setSuccessResult(result)
      } else {
        setAttemptsRemaining(result.attempts_remaining)
        if (result.attempts_remaining <= 0) {
          setError('Maximum verification attempts exceeded. This claim has been locked to protect the owner.')
        } else {
          setError(`Verification failed. That identifying detail does not match (${result.attempts_remaining} attempt(s) remaining).`)
        }
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      title="Verify Ownership"
      subtitle="Smart Fuzzy & Semantic Ownership Challenge"
      onClose={onClose}
    >
      <div className="claim-note">
        <ShieldCheck size={22} />
        <div>
          <strong>Smart Ownership Verification</strong>
          <p>
            The finder asked a private question to verify ownership.
            SafeKeep uses smart fuzzy &amp; semantic relation verification, so minor typos or phrasing differences won't prevent a valid match.
          </p>
        </div>
      </div>

      {isSuccess && successResult ? (
        <div className="claim-success-state">
          <div className="success-icon">
            <CheckCircle2 size={48} />
          </div>
          <h3>Ownership Verified!</h3>
          <p>
            Your identifying detail matched the finder's record. A private, secure messaging channel is now unlocked with {successResult.finder_name || 'the finder'}.
          </p>
          <button
            className="button full"
            onClick={() => onVerified(successResult)}
          >
            Open Chat &amp; Arrange Handover
          </button>
        </div>
      ) : loadingPrompt ? (
        <div className="claim-loading">
          <p>Retrieving secure verification challenge…</p>
        </div>
      ) : (
        <form className="form" onSubmit={handleSubmit}>
          <div className="prompt-display">
            <label>Question from the finder:</label>
            <p className="prompt-question">“{prompt || 'What unique identifying mark is on this item?'}”</p>
          </div>

          <label>
            Your identifying answer *
            <input
              autoFocus
              required
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Describe the identifying detail in your own words…"
              disabled={pending || attemptsRemaining <= 0}
            />
          </label>

          {error && (
            <div className="form-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="attempts-indicator">
            Attempts remaining: <strong>{attemptsRemaining} / 3</strong>
          </div>

          <button
            className="button full"
            disabled={pending || attemptsRemaining <= 0 || !answer.trim()}
          >
            <ClipboardCheck size={17} />
            {pending ? 'Verifying with smart matching…' : 'Submit Identifying Answer'}
          </button>
        </form>
      )}
    </Dialog>
  )
}
