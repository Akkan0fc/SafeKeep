import { useState, type FormEvent } from 'react'
import { ImagePlus, ShieldCheck, Sparkles, ScanText, Tag } from 'lucide-react'
import { Dialog } from '../../components/Dialog'
import {
  uploadImage,
  processImageWithAI,
  createReport,
  saveFoundVerification,
  requestRanking,
  errorMessage,
  type ProcessingResult,
} from '../../services/api'
import { extractBrandFromText } from '../../services/mockData'
import type { Item, ItemType, UserProfile } from '../../types'

interface ReportModalProps {
  initialType?: ItemType
  user: UserProfile
  initialTitle?: string
  initialLocation?: string
  onClose: () => void
  onCreated: (item: Item) => void
}

export function ReportModal({
  initialType = 'lost',
  user,
  initialTitle = '',
  initialLocation = '',
  onClose,
  onCreated,
}: ReportModalProps) {
  const [type, setType] = useState<ItemType>(initialType)
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState(initialLocation)
  const [occurredAt, setOccurredAt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // OCR & brand detection states
  const [ocrScanning, setOcrScanning] = useState(false)
  const [detectedBrand, setDetectedBrand] = useState<string | null>(null)
  const [detectedOcrText, setDetectedOcrText] = useState<string | null>(null)
  const [cachedAiResult, setCachedAiResult] = useState<ProcessingResult | null>(null)

  // Private verification fields for found items
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')

  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setPreviewUrl(URL.createObjectURL(selected))
      setOcrScanning(true)

      // Fallback local heuristic brand check right away
      const initialBrand = extractBrandFromText(`${title} ${description} ${selected.name}`)
      if (initialBrand) {
        setDetectedBrand(initialBrand)
      }

      try {
        const res = await processImageWithAI(
          selected,
          type,
          `${title}. ${description}. Location: ${location}`
        )
        if (res) {
          setCachedAiResult(res)
          const brandFound = res.primary_brand || (res.detected_brands && res.detected_brands[0]) || initialBrand
          if (brandFound) {
            setDetectedBrand(brandFound)
            if (!title) {
              setTitle(`${brandFound} Item`)
            }
          }
          if (res.ocr_text) {
            setDetectedOcrText(res.ocr_text)
          }
        }
      } catch (err) {
        console.warn('Background OCR pre-scan failed:', err)
      } finally {
        setOcrScanning(false)
      }
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Please add a clear photo of the item.')
      return
    }

    if (type === 'found' && (!prompt.trim() || !answer.trim())) {
      setError('Both a secret question and the expected answer are required to protect this found item.')
      return
    }

    setSaving(true)
    setError('')

    try {
      setStatusMessage('Uploading item photo to storage...')
      const imagePath = await uploadImage(user.id, type, file)

      let aiResult = cachedAiResult
      if (!aiResult) {
        setStatusMessage('Reading printed text & brand via OCR, BLIP & CLIP AI...')
        aiResult = await processImageWithAI(
          file,
          type,
          `${title}. ${description}. Location: ${location}`
        )
      }

      const finalBrand =
        detectedBrand ||
        aiResult?.primary_brand ||
        extractBrandFromText(`${title} ${description} ${aiResult?.ocr_text || ''}`) ||
        undefined

      const finalOcr = detectedOcrText || aiResult?.ocr_text || undefined

      setStatusMessage('Saving document to Appwrite Database...')
      const report = await createReport({
        userId: user.id,
        userName: user.name,
        type,
        title,
        description,
        location,
        occurredAt,
        imagePath,
        imageUrl: previewUrl || undefined,
        caption: aiResult?.caption,
        embedding: aiResult?.embedding,
        ocrText: finalOcr,
        brand: finalBrand,
      })

      if (type === 'found') {
        setStatusMessage('Securing private verification question...')
        await saveFoundVerification(report.id, prompt, answer)
        // Also trigger ranking against open lost reports
        setStatusMessage('Scanning for potential matches against lost reports...')
        await requestRanking(report.id)
      } else {
        setStatusMessage('Scanning for matching found candidates...')
        await requestRanking(report.id)
      }

      onCreated(report)
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={type === 'lost' ? 'Report a Lost Item' : 'Report a Found Item'}
      subtitle={
        type === 'lost'
          ? 'Describe what you lost. Lost reports appear on the campus feed so finders and AI can locate a match.'
          : 'Found reports remain strictly confidential and never appear in public feeds. Potential owners must answer your secret question.'
      }
      onClose={onClose}
    >
      <div className="type-toggle">
        <button
          type="button"
          className={type === 'lost' ? 'active' : ''}
          onClick={() => setType('lost')}
          disabled={saving}
        >
          I Lost an Item
        </button>
        <button
          type="button"
          className={type === 'found' ? 'active' : ''}
          onClick={() => setType('found')}
          disabled={saving}
        >
          I Found an Item
        </button>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <div className="two-col">
          <label>
            Item name / title *
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Matte Black AirPods Pro"
              disabled={saving}
            />
          </label>

          <label>
            Campus location *
            <input
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Central Library 2nd Floor"
              disabled={saving}
            />
          </label>
        </div>

        <label>
          Description *
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Color, brand, distinguishing visual traits or model details..."
            disabled={saving}
          />
        </label>

        <label>
          When did it happen?
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            disabled={saving}
          />
        </label>

        <div className="upload-wrapper">
          <label className="upload">
            <ImagePlus size={22} />
            <span>{file ? file.name : 'Upload a photo of the item (required for AI matching)'}</span>
            <input
              type="file"
              accept="image/*"
              required={!file}
              onChange={handleFileChange}
              disabled={saving}
            />
          </label>
          {previewUrl && (
            <div className="image-preview-thumbnail">
              <img src={previewUrl} alt="Upload preview" />
            </div>
          )}
        </div>

        {ocrScanning && (
          <div className="ocr-status-box scanning">
            <Sparkles size={16} className="spinner" />
            <span>AI scanning photo for brand logo and text via OCR…</span>
          </div>
        )}

        {detectedBrand && (
          <div className="ocr-status-box detected">
            <div className="ocr-badge-row">
              <span className="badge-brand">
                <Tag size={13} /> Brand Identified: <strong>{detectedBrand}</strong>
              </span>
              {detectedOcrText && (
                <span className="badge-ocr">
                  <ScanText size={13} /> OCR: "{detectedOcrText}"
                </span>
              )}
            </div>
            <p className="ocr-hint">
              ✓ Multi-modal verification active: SafeKeep will match this strictly with {detectedBrand} reports, avoiding mixups with other brands (e.g. OnePlus vs AirPods).
            </p>
          </div>
        )}

        {type === 'found' && (
          <div className="private-fields">
            <div className="private-fields-header">
              <ShieldCheck size={20} />
              <div>
                <strong>Private Ownership Verification (Required)</strong>
                <p>
                  To prevent fraudulent claims, this found report will not be listed publicly.
                  Only claimants with high AI similarity will be prompted with this question.
                </p>
              </div>
            </div>

            <label>
              Question for the owner *
              <input
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. What color or word is on the keychain attached to the keys?"
                disabled={saving}
              />
            </label>

            <label>
              Expected private answer *
              <input
                required
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="e.g. Blue star with BU logo"
                disabled={saving}
              />
            </label>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}

        {saving && (
          <div className="saving-progress">
            <Sparkles size={18} className="spinner" />
            <span>{statusMessage}</span>
          </div>
        )}

        <button className="button full" disabled={saving}>
          {saving
            ? 'Processing with SafeKeep AI…'
            : type === 'lost'
            ? 'Publish Lost Report'
            : 'Secure Found Report'}
        </button>
      </form>
    </Dialog>
  )
}
