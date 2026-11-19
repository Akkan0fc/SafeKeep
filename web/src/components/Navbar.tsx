import { ShieldCheck, UserRound, LogOut, MessageCircle, Sparkles, FileText, Layers, Sun, Moon } from 'lucide-react'
import type { UserProfile } from '../types'
import { isConfigured } from '../services/appwrite'

export type NavTab = 'feed' | 'reports' | 'matches' | 'chat'

interface NavbarProps {
  currentTab: NavTab
  onSelectTab: (tab: NavTab) => void
  user: UserProfile | null
  activeMatchesCount: number
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onOpenAuth: () => void
  onSignOut: () => void
}

export function Navbar({
  currentTab,
  onSelectTab,
  user,
  activeMatchesCount,
  theme,
  onToggleTheme,
  onOpenAuth,
  onSignOut,
}: NavbarProps) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => onSelectTab('feed')} aria-label="SafeKeep home">
        <ShieldCheck size={28} />
        <span>Safe<span>Keep</span></span>
      </button>

      <nav>
        <button
          className={currentTab === 'feed' ? 'selected' : ''}
          onClick={() => onSelectTab('feed')}
        >
          <Layers size={16} /> Lost feed
        </button>
        <button
          className={currentTab === 'reports' ? 'selected' : ''}
          onClick={() => onSelectTab('reports')}
        >
          <FileText size={16} /> My reports
        </button>
        <button
          className={currentTab === 'matches' ? 'selected' : ''}
          onClick={() => onSelectTab('matches')}
        >
          <Sparkles size={16} /> Matches
          {activeMatchesCount > 0 && <b>{activeMatchesCount}</b>}
        </button>
        <button
          className={currentTab === 'chat' ? 'selected' : ''}
          onClick={() => onSelectTab('chat')}
        >
          <MessageCircle size={16} /> Messages
        </button>
      </nav>

      <div className="user-section">
        <button
          type="button"
          className="icon-button theme-toggle-btn"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={18} className="theme-icon sun" /> : <Moon size={18} className="theme-icon moon" />}
        </button>

        {isConfigured ? (
          <span className="demo-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
            Appwrite Live
          </span>
        ) : (
          <span className="demo-pill" title="Running in simulated local demo mode">
            Demo Mode
          </span>
        )}
        {user ? (
          <div className="user-menu">
            <span title={user.email}>
              <UserRound size={16} /> {user.name}
            </span>
            <button className="icon-button" title="Sign out" onClick={onSignOut}>
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <button className="button quiet" onClick={onOpenAuth}>
            Sign in
          </button>
        )}
      </div>
    </header>
  )
}
