import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}

export function Dialog({ title, subtitle, onClose, children }: DialogProps) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={(e) => {
      if (e.target === e.currentTarget) onClose()
    }}>
      <section className="dialog">
        <button className="close" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
        <h2>{title}</h2>
        {subtitle && <p className="dialog-intro">{subtitle}</p>}
        {children}
      </section>
    </div>
  )
}
