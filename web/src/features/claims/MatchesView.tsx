import { Sparkles, ClipboardCheck, CheckCircle2, AlertCircle, MessageCircle } from 'lucide-react'
import type { Match, Item } from '../../types'

interface MatchesViewProps {
  matches: Match[]
  reports: Item[]
  onClaim: (match: Match) => void
  onOpenChat: (itemId: string, otherUserId: string, otherUserName: string) => void
}

export function MatchesView({
  matches,
  reports,
  onClaim,
  onOpenChat,
}: MatchesViewProps) {
  const getLostTitle = (lostId: string) => {
    const report = reports.find((r) => r.id === lostId)
    return report?.title || 'Your lost item'
  }

  return (
    <section className="content page-section">
      <div className="section-title">
        <div>
          <p className="eyebrow">Private Candidate Intelligence</p>
          <h1>Potential Matches</h1>
        </div>
        <span className="privacy-note">
          <Sparkles size={16} /> AI Suggests • You Verify
        </span>
      </div>

      <p className="page-intro">
        Our multi-modal matching engine computes similarity using CLIP image embeddings, BLIP text captions, and campus location compatibility. Candidate details remain hidden until you answer the finder's private ownership question.
      </p>

      <div className="match-list">
        {matches.length > 0 ? (
          matches.map((match) => {
            const pct = Math.round(match.similarity_score * 100)
            return (
              <article className="match-card" key={match.id}>
                <div className="match-icon">
                  <Sparkles size={22} />
                </div>

                <div className="match-info">
                  <div className="match-header">
                    <span className={`pill ${match.status}`}>{match.status}</span>
                    <span className="similarity-badge">{pct}% Similarity</span>
                  </div>
                  <h3>Possible match for “{getLostTitle(match.lost_item_id)}”</h3>
                  <p>
                    Found item details are hidden for privacy. A high similarity score suggests a candidate, not ownership.
                  </p>
                </div>

                <div className="match-action">
                  {match.status === 'suggested' || match.status === 'claimed' ? (
                    <button className="button" onClick={() => onClaim(match)}>
                      <ClipboardCheck size={17} /> Verify ownership
                    </button>
                  ) : match.status === 'verified' ? (
                    <button
                      className="button secondary"
                      onClick={() =>
                        onOpenChat(
                          match.found_item_id,
                          'finder-placeholder',
                          'Item Finder'
                        )
                      }
                    >
                      <MessageCircle size={17} /> Open verified chat
                    </button>
                  ) : (
                    <span className="rejected-badge">
                      <AlertCircle size={16} /> Verification failed
                    </span>
                  )}
                </div>
              </article>
            )
          })
        ) : (
          <div className="empty">
            <Sparkles size={34} />
            <h3>No candidate matches yet</h3>
            <p>
              When a campus member submits a found item matching your lost report's photo or description, SafeKeep will generate a private match here.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
