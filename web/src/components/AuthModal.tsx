import { useState, type FormEvent } from 'react'
import { Dialog } from './Dialog'
import { signIn, signUp, errorMessage } from '../services/api'
import type { UserProfile } from '../types'

interface AuthModalProps {
  onClose: () => void
  onSuccess: (user: UserProfile) => void
}

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setPending(true)

    try {
      let user: UserProfile
      if (mode === 'signUp') {
        user = await signUp(name || email.split('@')[0], email, password)
      } else {
        user = await signIn(email, password)
      }
      onSuccess(user)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      title={mode === 'signIn' ? 'Sign in to SafeKeep' : 'Create campus account'}
      subtitle={
        mode === 'signIn'
          ? 'Enter your student email and password to access your reports, matches, and chats.'
          : 'Register your university email to report lost/found items and verify claims securely.'
      }
      onClose={onClose}
    >
      <form className="form" onSubmit={handleSubmit}>
        {mode === 'signUp' && (
          <label>
            Full name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </label>
        )}
        <label>
          Campus email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@example.edu"
          />
        </label>
        <label>
          Password
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="button full" disabled={pending}>
          {pending ? 'Please wait…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        className="text-button"
        onClick={() => {
          setMode(mode === 'signIn' ? 'signUp' : 'signIn')
          setError('')
        }}
      >
        {mode === 'signIn'
          ? "Don't have an account? Sign up"
          : 'Already have an account? Sign in'}
      </button>
    </Dialog>
  )
}
