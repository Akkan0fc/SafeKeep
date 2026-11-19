import { Plus, Search, HandHeart, CheckCircle2, ShieldCheck } from 'lucide-react'
import type { Item, ItemType } from '../../types'

interface MyReportsProps {
  reports: Item[]
  onNewReport: (type: ItemType) => void
  onItemClick: (item: Item) => void
  onMarkReturned: (itemId: string) => void
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function MyReports({
  reports,
  onNewReport,
  onItemClick,
  onMarkReturned,
}: MyReportsProps) {
  return (
    <section className="content page-section">
      <div className="section-title">
        <div>
          <p className="eyebrow">Your campus activity</p>
          <h1>My Reports</h1>
        </div>
        <div className="actions">
          <button className="button secondary" onClick={() => onNewReport('found')}>
            <Plus size={17} /> Report Found
          </button>
          <button className="button" onClick={() => onNewReport('lost')}>
            <Plus size={17} /> Report Lost
          </button>
        </div>
      </div>

      <p className="page-intro">
        Track your reported lost belongings and items you found on campus. You can update an item's status to <strong>Returned</strong> once handed back.
      </p>

      <div className="report-list">
        {reports.length > 0 ? (
          reports.map((item) => (
            <article className="report-row" key={item.id}>
              <div className={`type-marker ${item.type}`}>
                {item.type === 'lost' ? <Search size={20} /> : <HandHeart size={20} />}
              </div>

              <div className="report-row-body" onClick={() => onItemClick(item)} role="button">
                <div className="row-heading">
                  <h3>{item.title}</h3>
                  <span className={`pill ${item.status}`}>{item.status}</span>
                </div>
                <p>
                  {item.type === 'found' ? (
                    <span className="privacy-badge">
                      <ShieldCheck size={13} /> Private found report • Hidden from public feed
                    </span>
                  ) : (
                    'Public lost report'
                  )}{' '}
                  • {item.location}
                </p>
              </div>

              <div className="report-row-actions">
                <time>{formatDate(item.created_at)}</time>
                {item.status !== 'returned' && (
                  <button
                    className="button quiet small"
                    onClick={() => onMarkReturned(item.id)}
                    title="Mark this item as safely returned to its owner"
                  >
                    <CheckCircle2 size={15} /> Mark returned
                  </button>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="empty">
            <Search size={32} />
            <h3>No reports yet</h3>
            <p>Start by submitting a lost or found report to see it tracked here.</p>
          </div>
        )}
      </div>
    </section>
  )
}
