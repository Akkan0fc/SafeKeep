import { MapPin, Calendar, UserRound, Sparkles, HandHeart, ImagePlus, ScanText, Tag } from 'lucide-react'
import { Dialog } from '../../components/Dialog'
import type { Item } from '../../types'

interface ItemDetailsModalProps {
  item: Item
  onClose: () => void
  onFoundClick?: (item: Item) => void
}

function formatFullDate(iso: string | null): string {
  if (!iso) return 'Not specified'
  try {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function ItemDetailsModal({ item, onClose, onFoundClick }: ItemDetailsModalProps) {
  return (
    <Dialog title={item.title} onClose={onClose}>
      <div className="item-detail-view">
        <div className="detail-image-box">
          {item.image_url ? (
            <img src={item.image_url} alt={item.title} className="detail-image" />
          ) : (
            <div className="detail-image-empty">
              <ImagePlus size={48} />
              <p>No photo provided</p>
            </div>
          )}
          <span className={`pill ${item.status}`}>{item.status}</span>
        </div>

        <div className="detail-meta-list">
          <div className="detail-meta-item">
            <MapPin size={17} />
            <div>
              <strong>Location</strong>
              <p>{item.location || 'Campus location not specified'}</p>
            </div>
          </div>

          <div className="detail-meta-item">
            <Calendar size={17} />
            <div>
              <strong>Time of loss</strong>
              <p>{formatFullDate(item.occurred_at || item.created_at)}</p>
            </div>
          </div>

          <div className="detail-meta-item">
            <UserRound size={17} />
            <div>
              <strong>Reported by</strong>
              <p>{item.user_name || 'Campus Student'}</p>
            </div>
          </div>

          {item.brand && (
            <div className="detail-meta-item">
              <Tag size={17} />
              <div>
                <strong>Brand (Verified)</strong>
                <p>{item.brand}</p>
              </div>
            </div>
          )}
        </div>

        <div className="detail-description">
          <h4>Description</h4>
          <p>{item.description}</p>
        </div>

        {item.brand && (
          <div className="brand-precision-notice">
            <Tag size={15} />
            <span>
              <strong>Brand-Enforced Match Precision:</strong> Reports with <em>{item.brand}</em> are strictly filtered to avoid misidentifications with conflicting brands (e.g. OnePlus vs Apple).
            </span>
          </div>
        )}

        {item.ocr_text && (
          <div className="ai-caption-box ocr-box">
            <ScanText size={16} />
            <div>
              <strong>OCR Text Discovered in Image</strong>
              <p>"{item.ocr_text}"</p>
            </div>
          </div>
        )}

        {item.ai_caption && (
          <div className="ai-caption-box">
            <Sparkles size={16} />
            <div>
              <strong>AI Visual Caption (BLIP)</strong>
              <p>"{item.ai_caption}"</p>
            </div>
          </div>
        )}

        <div className="dialog-actions">
          {onFoundClick && item.type === 'lost' && (
            <button
              className="button full"
              onClick={() => {
                onClose()
                onFoundClick(item)
              }}
            >
              <HandHeart size={18} /> I found this item!
            </button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
