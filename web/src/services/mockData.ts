import type { Item, Match, ClaimResult, ClaimStart, ChatMessage, UserProfile } from '../types'
import { verifyAnswerRelation } from '../utils/fuzzyVerification'

export const DEMO_USER: UserProfile = {
  id: 'demo-student-1',
  name: 'Demo Reporter',
  email: 'reporter@example.test',
}

export const DEMO_FINDER: UserProfile = {
  id: 'demo-student-2',
  name: 'Demo Finder',
  email: 'finder@example.test',
}

const STORAGE_KEY = 'safekeep_mock_state_v2'

const KNOWN_BRANDS = [
  'OnePlus', 'Apple', 'Boat', 'Noise', 'Sony', 'Samsung', 'JBL', 'Boult',
  'Realme', 'Xiaomi', 'Redmi', 'Nothing', 'Casio', 'Dell', 'HP', 'Lenovo',
  'Asus', 'Acer', 'Logitech', 'Fastrack', 'Titan', 'Wildcraft', 'Nike', 'Puma'
]

export function extractBrandFromText(text: string): string | null {
  if (!text) return null
  const lower = text.toLowerCase()
  if (lower.includes('oneplus') || lower.includes('one plus') || lower.includes('1+') || lower.includes('nord buds') || lower.includes('nord')) {
    return 'OnePlus'
  }
  if (lower.includes('airpod') || lower.includes('airpods') || lower.includes('apple') || lower.includes('macbook') || lower.includes('ipad')) {
    return 'Apple'
  }
  for (const b of KNOWN_BRANDS) {
    if (new RegExp(`\\b${b.toLowerCase()}\\b`).test(lower)) {
      return b
    }
  }
  return null
}

interface MockState {
  items: Item[]
  verifications: Record<string, { prompt: string; answer: string }>
  matches: Match[]
  claims: Record<string, { claimant_id: string; found_item_id: string; attempts: number; verified: boolean }>
  messages: Record<string, ChatMessage[]>
}

const INITIAL_ITEMS: Item[] = [
  {
    id: 'lost-1',
    type: 'lost',
    title: 'Apple AirPods Pro (2nd Gen)',
    description: 'White AirPods inside a matte black silicone case with a small carabiner. Lost near the 2nd floor library quiet zone.',
    image_path: null,
    image_url: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?auto=format&fit=crop&w=600&q=80',
    location: 'Central Library, 2nd Floor',
    occurred_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    status: 'open',
    ai_caption: 'a close up of a white airpod case on a table',
    ocr_text: 'Designed by Apple in California Model A2931',
    brand: 'Apple',
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    user_id: DEMO_USER.id,
    user_name: DEMO_USER.name,
  },
  {
    id: 'lost-4',
    type: 'lost',
    title: 'OnePlus Nord Buds 2 (White)',
    description: 'White wireless earbuds in a white rectangular rounded case. Has red accent charging cable in pouch.',
    image_path: null,
    image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=600&q=80',
    location: 'Indoor Sports Complex, Badminton Court',
    occurred_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    status: 'open',
    ai_caption: 'a pair of white wireless earphones on a desk',
    ocr_text: 'ONEPLUS NORD BUDS',
    brand: 'OnePlus',
    created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    user_id: DEMO_USER.id,
    user_name: DEMO_USER.name,
  },
  {
    id: 'lost-2',
    type: 'lost',
    title: 'Bennett University Student ID Card',
    description: 'Sample computer science ID card in a blue lanyard with a university crest.',
    image_path: null,
    image_url: 'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=600&q=80',
    location: 'Campus Canteen Core 1',
    occurred_at: new Date(Date.now() - 3600000 * 18).toISOString(),
    status: 'open',
    ai_caption: 'a campus identification card with blue lanyard',
    ocr_text: 'SAMPLE STUDENT ID',
    brand: 'Bennett University',
    created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
    user_id: 'user-3',
    user_name: 'Demo Student',
  },
  {
    id: 'lost-3',
    type: 'lost',
    title: 'Casio fx-991CW ClassWiz Calculator',
    description: 'Black scientific calculator with yellow sticker on the sliding protective cover. Left on desk 34 during mathematics tutorial.',
    image_path: null,
    image_url: 'https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?auto=format&fit=crop&w=600&q=80',
    location: 'Academic Block A, Room 102',
    occurred_at: new Date(Date.now() - 3600000 * 28).toISOString(),
    status: 'open',
    ai_caption: 'a black scientific calculator on a classroom wooden desk',
    ocr_text: 'CASIO fx-991CW CLASSWIZ',
    brand: 'Casio',
    created_at: new Date(Date.now() - 3600000 * 28).toISOString(),
    user_id: 'user-4',
    user_name: 'Demo Classmate',
  },
  {
    id: 'found-1',
    type: 'found',
    title: 'AirPods in Dark Case',
    description: 'Found black case earbuds on table beside window in the library reading room.',
    image_path: null,
    image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=600&q=80',
    location: 'Central Library, 2nd Floor',
    occurred_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    status: 'open',
    ai_caption: 'wireless earphones in a black protective silicone pouch',
    ocr_text: 'Apple Inc.',
    brand: 'Apple',
    created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    user_id: DEMO_FINDER.id,
    user_name: DEMO_FINDER.name,
  },
  {
    id: 'found-2',
    type: 'found',
    title: 'White Wireless Earbuds (OnePlus)',
    description: 'Found white TWS earbuds near bench in badminton court.',
    image_path: null,
    image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=600&q=80',
    location: 'Indoor Sports Complex, Badminton Court',
    occurred_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    status: 'open',
    ai_caption: 'white earbuds inside charging case with brand imprint',
    ocr_text: 'ONEPLUS',
    brand: 'OnePlus',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    user_id: DEMO_FINDER.id,
    user_name: DEMO_FINDER.name,
  },
]

const INITIAL_VERIFICATIONS: Record<string, { prompt: string; answer: string }> = {
  'found-1': {
    prompt: 'What specific accessory or mark is attached to the case?',
    answer: 'carabiner',
  },
  'found-2': {
    prompt: 'What brand name is printed on the earbuds?',
    answer: 'oneplus',
  },
}

const INITIAL_MATCHES: Match[] = [
  {
    id: 'match-1',
    lost_item_id: 'lost-1',
    found_item_id: 'found-1',
    similarity_score: 0.92,
    status: 'suggested',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    lost_item_title: 'Apple AirPods Pro (2nd Gen)',
    lost_item_location: 'Central Library, 2nd Floor',
  },
  {
    id: 'match-2',
    lost_item_id: 'lost-4',
    found_item_id: 'found-2',
    similarity_score: 0.94,
    status: 'suggested',
    created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    lost_item_title: 'OnePlus Nord Buds 2 (White)',
    lost_item_location: 'Indoor Sports Complex, Badminton Court',
  },
]

function getMockState(): MockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  const initial: MockState = {
    items: INITIAL_ITEMS,
    verifications: INITIAL_VERIFICATIONS,
    matches: INITIAL_MATCHES,
    claims: {},
    messages: {
      'found-1': [
        {
          id: 'msg-1',
          sender_id: DEMO_FINDER.id,
          sender_name: DEMO_FINDER.name,
          message: 'Hi! I found these AirPods on the 2nd floor library desk. Verified your ownership!',
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
    },
  }
  saveMockState(initial)
  return initial
}

function saveMockState(state: MockState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

export const MockService = {
  getCurrentUser(): UserProfile | null {
    const raw = localStorage.getItem('safekeep_mock_user')
    if (raw) {
      try { return JSON.parse(raw) } catch {}
    }
    return DEMO_USER
  },

  signIn(email: string): UserProfile {
    const user: UserProfile = {
      id: email.includes('finder') ? DEMO_FINDER.id : DEMO_USER.id,
      name: email.split('@')[0].replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      email,
    }
    localStorage.setItem('safekeep_mock_user', JSON.stringify(user))
    return user
  },

  signUp(name: string, email: string): UserProfile {
    const user: UserProfile = {
      id: 'user-' + Math.random().toString(36).substring(2, 9),
      name: name.trim() || email.split('@')[0],
      email,
    }
    localStorage.setItem('safekeep_mock_user', JSON.stringify(user))
    return user
  },

  signOut(): void {
    localStorage.removeItem('safekeep_mock_user')
  },

  getPublicLostItems(query = ''): Item[] {
    const state = getMockState()
    const lost = state.items.filter((item) => item.type === 'lost' && item.status === 'open')
    if (!query.trim()) return lost
    const q = query.toLowerCase()
    return lost.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q)
    )
  },

  getMyItems(userId: string): Item[] {
    const state = getMockState()
    return state.items.filter((item) => item.user_id === userId)
  },

  createReport(data: {
    userId: string
    userName: string
    type: 'lost' | 'found'
    title: string
    description: string
    location: string
    occurredAt: string
    imagePath?: string
    imageUrl?: string
    caption?: string
    ocrText?: string
    brand?: string
  }): Item {
    const state = getMockState()
    const detectedBrand = data.brand || extractBrandFromText(`${data.title} ${data.description} ${data.ocrText || ''}`)
    const newItem: Item = {
      id: `${data.type}-${Math.random().toString(36).substring(2, 9)}`,
      type: data.type,
      title: data.title,
      description: data.description,
      location: data.location,
      occurred_at: data.occurredAt || new Date().toISOString(),
      image_path: data.imagePath || null,
      image_url: data.imageUrl || (data.type === 'lost'
        ? 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=600&q=80'
        : 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80'),
      status: 'open',
      ai_caption: data.caption || `campus item: ${data.title}`,
      ocr_text: data.ocrText || null,
      brand: detectedBrand,
      created_at: new Date().toISOString(),
      user_id: data.userId,
      user_name: data.userName,
    }

    state.items.unshift(newItem)

    // Simulate match detection according to Algorithm 2 with Brand Checking
    if (data.type === 'lost') {
      const foundCandidates = state.items.filter((i) => i.type === 'found' && i.status === 'open')
      for (const candidate of foundCandidates) {
        // 1. BRAND CONFLICT CHECK: Disqualify if brands contradict (e.g. OnePlus vs Apple)
        const qBrand = newItem.brand || extractBrandFromText(`${newItem.title} ${newItem.description}`)
        const cBrand = candidate.brand || extractBrandFromText(`${candidate.title} ${candidate.description}`)
        if (qBrand && cBrand && qBrand.toLowerCase() !== cBrand.toLowerCase()) {
          continue // Reject candidate match due to brand conflict!
        }

        const titleMatch = candidate.title.toLowerCase().split(' ').some((w) => w.length > 3 && data.title.toLowerCase().includes(w))
        const locationMatch = candidate.location.toLowerCase() === data.location.toLowerCase()
        const brandMatch = qBrand && cBrand && qBrand.toLowerCase() === cBrand.toLowerCase()

        if (titleMatch || locationMatch || brandMatch) {
          let score = 0.72
          if (titleMatch && locationMatch) score = 0.88
          if (brandMatch) score = Math.min(0.96, score + 0.12)
          state.matches.push({
            id: `match-${Math.random().toString(36).substring(2, 9)}`,
            lost_item_id: newItem.id,
            found_item_id: candidate.id,
            similarity_score: score,
            status: 'suggested',
            created_at: new Date().toISOString(),
            lost_item_title: newItem.title,
            lost_item_location: newItem.location,
          })
        }
      }
    } else {
      // New found item -> check existing lost items
      const lostCandidates = state.items.filter((i) => i.type === 'lost' && i.status === 'open')
      for (const candidate of lostCandidates) {
        // 1. BRAND CONFLICT CHECK: Disqualify if brands contradict (e.g. OnePlus vs Apple)
        const qBrand = newItem.brand || extractBrandFromText(`${newItem.title} ${newItem.description}`)
        const cBrand = candidate.brand || extractBrandFromText(`${candidate.title} ${candidate.description}`)
        if (qBrand && cBrand && qBrand.toLowerCase() !== cBrand.toLowerCase()) {
          continue // Reject candidate match due to brand conflict!
        }

        const titleMatch = candidate.title.toLowerCase().split(' ').some((w) => w.length > 3 && data.title.toLowerCase().includes(w))
        const locationMatch = candidate.location.toLowerCase() === data.location.toLowerCase()
        const brandMatch = qBrand && cBrand && qBrand.toLowerCase() === cBrand.toLowerCase()

        if (titleMatch || locationMatch || brandMatch) {
          let score = 0.72
          if (titleMatch && locationMatch) score = 0.88
          if (brandMatch) score = Math.min(0.96, score + 0.12)
          state.matches.push({
            id: `match-${Math.random().toString(36).substring(2, 9)}`,
            lost_item_id: candidate.id,
            found_item_id: newItem.id,
            similarity_score: score,
            status: 'suggested',
            created_at: new Date().toISOString(),
            lost_item_title: candidate.title,
            lost_item_location: candidate.location,
          })
        }
      }
    }

    saveMockState(state)
    return newItem
  },

  saveFoundVerification(itemId: string, prompt: string, answer: string): void {
    const state = getMockState()
    state.verifications[itemId] = { prompt: prompt.trim(), answer: answer.trim().toLowerCase() }
    saveMockState(state)
  },

  getMatchesForLostItem(itemId: string): Match[] {
    const state = getMockState()
    return state.matches.filter((m) => m.lost_item_id === itemId)
  },

  startClaim(matchId: string): ClaimStart {
    const state = getMockState()
    const match = state.matches.find((m) => m.id === matchId)
    if (!match) throw new Error('Match record not found')

    const verif = state.verifications[match.found_item_id]
    const prompt = verif?.prompt || 'What is a unique distinguishing mark or identifier on this item?'

    state.claims[matchId] = {
      claimant_id: DEMO_USER.id,
      found_item_id: match.found_item_id,
      attempts: 0,
      verified: false,
    }
    match.status = 'claimed'
    saveMockState(state)

    return {
      claim_id: matchId,
      prompt,
    }
  },

  reportFoundForLostItem(
    lostItem: Item,
    finder: UserProfile,
    prompt: string,
    answer: string
  ): { foundItem: Item; match: Match } {
    const state = getMockState()
    const foundId = `found-${Math.random().toString(36).substring(2, 9)}`
    const now = new Date().toISOString()

    const foundItem: Item = {
      id: foundId,
      type: 'found',
      title: lostItem.title,
      description: `Found item corresponding to lost report "${lostItem.title}". Location: ${lostItem.location}.`,
      image_path: lostItem.image_path,
      image_url: lostItem.image_url,
      location: lostItem.location,
      occurred_at: now,
      status: 'open',
      ai_caption: lostItem.ai_caption,
      created_at: now,
      user_id: finder.id,
      user_name: finder.name,
    }

    state.items.unshift(foundItem)

    // Save secret verification challenge
    state.verifications[foundId] = {
      prompt: prompt.trim(),
      answer: answer.trim(),
    }

    // Automatically create direct match linking finder's found report to owner's lost report
    const matchId = `match-${Math.random().toString(36).substring(2, 9)}`
    const match: Match = {
      id: matchId,
      lost_item_id: lostItem.id,
      found_item_id: foundId,
      similarity_score: 1.0,
      status: 'suggested',
      created_at: now,
      lost_item_title: lostItem.title,
      lost_item_location: lostItem.location,
    }

    state.matches.unshift(match)
    saveMockState(state)

    return { foundItem, match }
  },

  verifyClaim(claimId: string, answer: string): ClaimResult {
    const state = getMockState()
    const claim = state.claims[claimId]
    const match = state.matches.find((m) => m.id === claimId)
    if (!claim || !match) throw new Error('Active claim record not found')

    const verif = state.verifications[claim.found_item_id]
    const expected = verif?.answer || 'carabiner'

    claim.attempts += 1
    const evaluation = verifyAnswerRelation(expected, answer)
    const isCorrect = evaluation.verified

    if (isCorrect) {
      claim.verified = true
      match.status = 'verified'
      const foundItem = state.items.find((i) => i.id === claim.found_item_id)
      if (foundItem) foundItem.status = 'claimed'
      saveMockState(state)
      return {
        verified: true,
        attempts_remaining: Math.max(0, 3 - claim.attempts),
        found_item_id: claim.found_item_id,
        finder_id: foundItem?.user_id || DEMO_FINDER.id,
        finder_name: foundItem?.user_name || DEMO_FINDER.name,
      }
    }

    const attemptsRemaining = Math.max(0, 3 - claim.attempts)
    if (attemptsRemaining === 0) {
      match.status = 'rejected'
    }
    saveMockState(state)
    return {
      verified: false,
      attempts_remaining: attemptsRemaining,
    }
  },

  getMessages(itemId: string): ChatMessage[] {
    const state = getMockState()
    return state.messages[itemId] || []
  },

  sendMessage(itemId: string, senderId: string, senderName: string, text: string): ChatMessage {
    const state = getMockState()
    if (!state.messages[itemId]) state.messages[itemId] = []
    const newMsg: ChatMessage = {
      id: 'msg-' + Math.random().toString(36).substring(2, 9),
      sender_id: senderId,
      sender_name: senderName,
      message: text.trim(),
      created_at: new Date().toISOString(),
    }
    state.messages[itemId].push(newMsg)
    saveMockState(state)
    return newMsg
  },

  markReturned(itemId: string): void {
    const state = getMockState()
    const item = state.items.find((i) => i.id === itemId)
    if (item) item.status = 'returned'
    saveMockState(state)
  },
}
