import { useEffect, useState, useMemo } from 'react'
import { KeyRound, ShieldCheck, X } from 'lucide-react'
import { Navbar, type NavTab } from './components/Navbar'
import { AuthModal } from './components/AuthModal'
import { Feed } from './features/items/Feed'
import { ItemDetailsModal } from './features/items/ItemDetailsModal'
import { ReportModal } from './features/items/ReportModal'
import { FoundThisItemModal } from './features/items/FoundThisItemModal'
import { MyReports } from './features/items/MyReports'
import { MatchesView } from './features/claims/MatchesView'
import { ClaimModal } from './features/claims/ClaimModal'
import { ChatView } from './features/chat/ChatView'
import { isConfigured } from './services/appwrite'
import {
  currentUser,
  getPublicLostItems,
  getMyItems,
  matchesForLostItem,
  updateItemStatus,
  signOut,
  errorMessage,
} from './services/api'
import type { Item, ItemType, Match, ClaimResult, UserProfile } from './types'

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [tab, setTab] = useState<NavTab>('feed')
  const [lostItems, setLostItems] = useState<Item[]>([])
  const [myReports, setMyReports] = useState<Item[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('safekeep_theme') : null
    if (saved === 'dark' || saved === 'light') return saved
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('safekeep_theme', theme)
    } catch {}
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  // Dialog states
  const [authOpen, setAuthOpen] = useState(false)
  const [reportingType, setReportingType] = useState<ItemType | null>(null)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [foundItemTarget, setFoundItemTarget] = useState<Item | null>(null)
  const [claimingMatch, setClaimingMatch] = useState<Match | null>(null)
  const [activeChat, setActiveChat] = useState<{
    itemId: string
    otherId: string
    otherName: string
    itemTitle?: string
  } | null>(null)

  // Initial load
  useEffect(() => {
    currentUser()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))

    loadFeed('')
  }, [])

  const loadFeed = async (q = search) => {
    try {
      const items = await getPublicLostItems(q)
      setLostItems(items)
    } catch (err) {
      setToast(errorMessage(err))
    }
  }

  const loadUserReports = async (uid = user?.id) => {
    if (!uid) return
    try {
      const items = await getMyItems(uid)
      setMyReports(items)
    } catch (err) {
      setToast(errorMessage(err))
    }
  }

  const loadMatches = async (reports = myReports) => {
    try {
      const lost = reports.filter((r) => r.type === 'lost')
      const matchResults = await Promise.all(lost.map((r) => matchesForLostItem(r.id)))
      const allMatches = matchResults.flat().sort((a, b) => b.similarity_score - a.similarity_score)
      setMatches(allMatches)
    } catch (err) {
      setToast(errorMessage(err))
    }
  }

  useEffect(() => {
    if (user) {
      loadUserReports(user.id)
    }
  }, [user?.id])

  useEffect(() => {
    if (myReports.length > 0) {
      loadMatches(myReports)
    }
  }, [myReports])

  const activeMatches = useMemo(
    () => matches.filter((m) => m.status === 'suggested' || m.status === 'claimed'),
    [matches]
  )

  const handleSelectTab = (nextTab: NavTab) => {
    if (!user && nextTab !== 'feed') {
      setAuthOpen(true)
      return
    }
    if (nextTab === 'matches') {
      loadMatches()
    }
    setTab(nextTab)
  }

  const handleReportClick = (type: ItemType) => {
    if (!user) {
      setAuthOpen(true)
      return
    }
    setReportingType(type)
  }

  const handleReportCreated = async (newItem: Item) => {
    setReportingType(null)
    await loadUserReports()
    if (newItem.type === 'lost') {
      await loadFeed()
      setTab('matches')
      await loadMatches([newItem, ...myReports])
      setToast('Lost report published! Checking hidden found reports for AI candidate matches…')
    } else {
      setToast('Found report secured! It is private and will never appear on the public feed.')
    }
  }

  const handleClaimVerified = (result: ClaimResult) => {
    setClaimingMatch(null)
    if (result.found_item_id && result.finder_id) {
      setActiveChat({
        itemId: result.found_item_id,
        otherId: result.finder_id,
        otherName: result.finder_name || 'Item Finder',
        itemTitle: 'Found Item',
      })
      setTab('chat')
      setToast('Ownership verified! Private chat unlocked.')
    }
  }

  const handleMarkReturned = async (itemId: string) => {
    try {
      await updateItemStatus(itemId, 'returned')
      await loadUserReports()
      setToast('Item status updated to Returned.')
    } catch (err) {
      setToast(errorMessage(err))
    }
  }

  const handleSignOut = async () => {
    await signOut()
    setUser(null)
    setMyReports([])
    setMatches([])
    setActiveChat(null)
    setTab('feed')
    setToast('Signed out of SafeKeep.')
  }

  if (loading) {
    return (
      <div className="boot">
        <ShieldCheck size={32} className="spinner" />
        <span>Initializing SafeKeep Campus Platform…</span>
      </div>
    )
  }

  return (
    <main>
      <Navbar
        currentTab={tab}
        onSelectTab={handleSelectTab}
        user={user}
        activeMatchesCount={activeMatches.length}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenAuth={() => setAuthOpen(true)}
        onSignOut={handleSignOut}
      />

      {!isConfigured && (
        <div className="config-warning">
          <KeyRound size={18} />
          <span>
            SafeKeep is running in <strong>Demo Campus Mode</strong> with interactive mock data.
            To connect live Appwrite, configure <code>web/.env.local</code> and <code>ai_server/.env</code> or run <code>python3 scripts/setup-appwrite.py</code>.
          </span>
        </div>
      )}

      {toast && (
        <div className="toast">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss message">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Pages */}
      {tab === 'feed' && (
        <Feed
          items={lostItems}
          search={search}
          onSearch={(q) => {
            setSearch(q)
            loadFeed(q)
          }}
          onReportClick={handleReportClick}
          onItemClick={(item) => setSelectedItem(item)}
        />
      )}

      {tab === 'reports' && user && (
        <MyReports
          reports={myReports}
          onNewReport={handleReportClick}
          onItemClick={(item) => setSelectedItem(item)}
          onMarkReturned={handleMarkReturned}
        />
      )}

      {tab === 'matches' && user && (
        <MatchesView
          matches={matches}
          reports={myReports}
          onClaim={(m) => setClaimingMatch(m)}
          onOpenChat={(itemId, otherId, otherName) => {
            setActiveChat({ itemId, otherId, otherName })
            setTab('chat')
          }}
        />
      )}

      {tab === 'chat' && user && (
        activeChat ? (
          <ChatView
            user={user}
            itemId={activeChat.itemId}
            otherId={activeChat.otherId}
            otherName={activeChat.otherName}
            itemTitle={activeChat.itemTitle}
            onItemReturned={loadUserReports}
          />
        ) : (
          <section className="content page-section chat-page">
            <div className="section-title">
              <div>
                <p className="eyebrow">Verified SafeKeep Channels</p>
                <h1>Messages &amp; Chat</h1>
              </div>
            </div>
            <div className="empty">
              <ShieldCheck size={36} />
              <h3>No active verified chats</h3>
              <p>
                Chat is unlocked only after a claimant successfully verifies ownership of a candidate match.
                Check your <strong>Matches</strong> tab to begin a verification challenge.
              </p>
            </div>
          </section>
        )
      )}

      {/* Modals */}
      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onSuccess={(loggedInUser) => {
            setUser(loggedInUser)
            setAuthOpen(false)
            setToast(`Welcome, ${loggedInUser.name}!`)
          }}
        />
      )}

      {reportingType && user && (
        <ReportModal
          initialType={reportingType}
          user={user}
          onClose={() => setReportingType(null)}
          onCreated={handleReportCreated}
        />
      )}

      {selectedItem && (
        <ItemDetailsModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onFoundClick={(item) => {
            setSelectedItem(null)
            if (!user) {
              setAuthOpen(true)
            } else if (item.user_id === user.id) {
              setToast('You cannot claim to have found your own lost item!')
            } else {
              setFoundItemTarget(item)
            }
          }}
        />
      )}

      {foundItemTarget && user && (
        <FoundThisItemModal
          lostItem={foundItemTarget}
          user={user}
          onClose={() => setFoundItemTarget(null)}
          onSuccess={async () => {
            setFoundItemTarget(null)
            await loadUserReports()
            await loadFeed()
            setToast('Found confirmation submitted! The owner will verify ownership using your secret question.')
          }}
        />
      )}

      {claimingMatch && user && (
        <ClaimModal
          match={claimingMatch}
          onClose={() => setClaimingMatch(null)}
          onVerified={handleClaimVerified}
        />
      )}
    </main>
  )
}
