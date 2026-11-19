import { MapPin, ImagePlus, Tag } from 'lucide-react'
import type { Item } from '../../types'

interface ItemCardProps {
  item: Item
  onClick: (item: Item) => void
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function ItemCard({ item, onClick }: ItemCardProps) {
  return (
    <article className="item-card" onClick={() => onClick(item)} role="button" tabIndex={0}>
      <div className="image-wrap">
        {item.image_url ? (
          <img src={item.image_url} alt={item.title} loading="lazy" />
        ) : (
          <div className="image-placeholder">
            <ImagePlus size={32} />
          </div>
        )}
        <div className="card-badge-container">
          <span className="badge-lost">LOST</span>
          {item.brand && (
            <span className="badge-brand" title={`Brand identified: ${item.brand}`}>
              <Tag size={11} /> {item.brand}
            </span>
          )}
        </div>
      </div>

      <div className="item-copy">
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <div className="item-meta">
          <span>
            <MapPin size={15} />
            {item.location || 'Campus location not specified'}
          </span>
          <time>{formatDate(item.created_at)}</time>
        </div>
      </div>
    </article>
  )
}
