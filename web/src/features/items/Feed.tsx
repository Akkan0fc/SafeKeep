import { useState, type FormEvent } from 'react'
import { Search, Plus, HandHeart, ShieldCheck, Sparkles } from 'lucide-react'
import { ItemCard } from './ItemCard'
import type { Item, ItemType } from '../../types'

interface FeedProps {
  items: Item[]
  search: string
  onSearch: (query: string) => void
  onReportClick: (type: ItemType) => void
  onItemClick: (item: Item) => void
}

const QUICK_LOCATIONS = ['All', 'Library', 'Canteen', 'Block A', 'Hostel', 'Gym']

export function Feed({
  items,
  search,
  onSearch,
  onReportClick,
  onItemClick,
}: FeedProps) {
  const [localSearch, setLocalSearch] = useState(search)
  const [selectedLocation, setSelectedLocation] = useState('All')

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSearch(localSearch)
  }

  const filteredItems = items.filter((item) => {
    if (selectedLocation === 'All') return true
    return item.location.toLowerCase().includes(selectedLocation.toLowerCase())
  })

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <p className="eyebrow">
            <ShieldCheck size={14} /> Privacy-First Campus Lost &amp; Found
          </p>
          <h1>
            Lost something?<br />
            <i>Start here.</i>
          </h1>
          <p className="lead">
            SafeKeep combines BLIP multimodal image captioning and CLIP vector similarity to connect lost items with private found records — eliminating false claims through item-specific verification.
          </p>
          <div className="actions">
            <button className="button" onClick={() => onReportClick('lost')}>
              <Plus size={18} /> I lost an item
            </button>
            <button className="button secondary" onClick={() => onReportClick('found')}>
              <HandHeart size={18} /> I found an item
            </button>
          </div>
        </div>

        <div className="hero-card">
          <div className="hero-card-icon">
            <ShieldCheck size={36} />
          </div>
          <h2>Privacy First Architecture</h2>
          <p>
            Found items are <strong>never publicized</strong> on the home feed.
            A candidate match is purely an AI suggestion — claimants must provide unique ownership proof before contact is permitted.
          </p>
          <div className="hero-card-stats">
            <div>
              <Sparkles size={16} />
              <span>CLIP &amp; BLIP Powered</span>
            </div>
          </div>
        </div>
      </section>

      <section className="content">
        <div className="section-title">
          <div>
            <p className="eyebrow">Public Campus Feed</p>
            <h2>Lost Item Reports</h2>
          </div>
          <span className="privacy-note">
            <ShieldCheck size={16} /> Found reports are strictly private
          </span>
        </div>

        <form className="search" onSubmit={handleSearchSubmit}>
          <Search size={20} />
          <input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search lost items by title, description, or campus building…"
          />
          <button type="submit">Search</button>
        </form>

        <div className="quick-filter-bar">
          <span className="filter-label">Filter campus area:</span>
          {QUICK_LOCATIONS.map((loc) => (
            <button
              key={loc}
              type="button"
              className={`filter-chip ${selectedLocation === loc ? 'active' : ''}`}
              onClick={() => setSelectedLocation(loc)}
            >
              {loc}
            </button>
          ))}
        </div>

        <div className="item-grid">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <ItemCard key={item.id} item={item} onClick={onItemClick} />
            ))
          ) : (
            <div className="empty">
              <ShieldCheck size={36} />
              <h3>No lost items found</h3>
              <p>Try searching for a different keyword or campus location, or report a lost item above.</p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
