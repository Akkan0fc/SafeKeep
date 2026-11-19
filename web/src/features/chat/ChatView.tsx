import { useState, useEffect, type FormEvent } from 'react'
import { CheckCircle2, MessageCircle, Send, ShieldCheck, CheckCheck } from 'lucide-react'
import { getMessages, sendMessage, updateItemStatus, errorMessage } from '../../services/api'
import type { ChatMessage, UserProfile } from '../../types'

interface ChatViewProps {
  user: UserProfile
  itemId: string
  otherId: string
  otherName: string
  itemTitle?: string
  onItemReturned?: () => void
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

export function ChatView({
  user,
  itemId,
  otherId,
  otherName,
  itemTitle = 'Lost & Found Item',
  onItemReturned,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [returned, setReturned] = useState(false)

  const loadChat = async () => {
    try {
      const msgs = await getMessages(itemId, otherId)
      setMessages(msgs)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadChat()
    const timer = setInterval(loadChat, 4000)
    return () => clearInterval(timer)
  }, [itemId, otherId])

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || sending) return

    setSending(true)
    setError('')
    try {
      const newMsg = await sendMessage(itemId, user.id, user.name, otherId, inputText)
      setMessages((prev) => [...prev, newMsg])
      setInputText('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const handleMarkReturned = async () => {
    if (!confirm('Confirm that this item has been returned to its verified owner?')) return
    try {
      await updateItemStatus(itemId, 'returned')
      setReturned(true)
      if (onItemReturned) onItemReturned()
      await sendMessage(
        itemId,
        user.id,
        user.name,
        otherId,
        'SafeKeep Notice: Item status has been marked as RETURNED.'
      )
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className="content page-section chat-page">
      <div className="section-title">
        <div>
          <p className="eyebrow">Verified SafeKeep Handover Channel</p>
          <h1>Chat with {otherName}</h1>
          <p className="chat-subtitle">Regarding: <strong>{itemTitle}</strong></p>
        </div>

        <div className="chat-actions">
          <span className="privacy-note">
            <CheckCircle2 size={16} /> Ownership Verified
          </span>
          {!returned ? (
            <button
              className="button secondary small"
              onClick={handleMarkReturned}
              title="Mark item as returned upon physical meetup"
            >
              <CheckCheck size={16} /> Mark as Returned
            </button>
          ) : (
            <span className="pill returned">Returned</span>
          )}
        </div>
      </div>

      <div className="chat-container">
        <div className="chat-header-banner">
          <ShieldCheck size={18} />
          <span>
            This private conversation is encrypted and unlocked exclusively for the verified claimant and finder.
            Arrange to meet at a public campus location (e.g. Student Center, Central Library Desk).
          </span>
        </div>

        <div className="chat-box">
          {loading ? (
            <p className="empty-chat">Loading conversation…</p>
          ) : messages.length > 0 ? (
            messages.map((m) => {
              const isMine = m.sender_id === user.id
              return (
                <div
                  key={m.id}
                  className={`chat-message-row ${isMine ? 'outgoing' : 'incoming'}`}
                >
                  <div className="message-bubble">
                    {!isMine && <span className="message-sender">{m.sender_name || otherName}</span>}
                    <p>{m.message}</p>
                    <time className="message-time">{formatTime(m.created_at)}</time>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="empty-chat">
              <MessageCircle size={32} />
              <p>You are verified! Send a message to coordinate returning the item on campus.</p>
            </div>
          )}
        </div>

        {error && <p className="form-error">{error}</p>}

        <form className="chat-form" onSubmit={handleSend}>
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Suggest a campus meetup spot or time…"
            disabled={sending}
          />
          <button className="button" disabled={sending || !inputText.trim()}>
            <Send size={16} /> {sending ? '…' : 'Send'}
          </button>
        </form>
      </div>
    </section>
  )
}
