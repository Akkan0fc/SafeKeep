import type { Models } from 'appwrite'
import {
  account,
  aiApiUrl,
  config,
  databases,
  ID,
  isConfigured,
  Permission,
  Query,
  Role,
  storage,
} from './appwrite'
import { MockService } from './mockData'
import type {
  ClaimResult,
  ClaimStart,
  ChatMessage,
  Item,
  ItemStatus,
  ItemType,
  Match,
  UserProfile,
} from '../types'

export type ProcessingResult = {
  caption: string
  embedding: number[]
  ocr_text?: string
  detected_brands?: string[]
  primary_brand?: string
}

type ItemDocument = Models.Document & {
  user_id: string
  user_name?: string
  type: ItemType
  title: string
  description: string
  location: string
  occurred_at?: string
  image_path?: string
  ai_caption?: string
  ocr_text?: string
  brand?: string
  embedding?: string
  status: ItemStatus
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unexpected error occurred. Please try again.'
}

function toItem(doc: ItemDocument): Item {
  let imageUrl: string | null = null
  if (doc.image_path) {
    try {
      imageUrl = storage.getFileView(config.bucketId, doc.image_path)
    } catch {
      imageUrl = null
    }
  }
  return {
    id: doc.$id,
    user_id: doc.user_id,
    user_name: doc.user_name || 'Campus Member',
    type: doc.type,
    title: doc.title,
    description: doc.description,
    location: doc.location,
    occurred_at: doc.occurred_at || null,
    image_path: doc.image_path || null,
    image_url: imageUrl,
    status: doc.status || 'open',
    ai_caption: doc.ai_caption || null,
    ocr_text: doc.ocr_text || null,
    brand: doc.brand || null,
    created_at: doc.$createdAt,
  }
}

async function jwt(): Promise<string> {
  const session = await account.createJWT()
  return session.jwt
}

async function secureFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let token = ''
  try {
    token = await jwt()
  } catch (err) {
    console.warn('Could not generate Appwrite JWT for secure request:', err)
  }
  const headers = new Headers(init.headers || {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(`${aiApiUrl}${path}`, { ...init, headers })
}

// ─── Authentication ──────────────────────────────────────────────────────────

export async function currentUser(): Promise<UserProfile | null> {
  if (!isConfigured) {
    return MockService.getCurrentUser()
  }
  try {
    const user = await account.get()
    return {
      id: user.$id,
      name: user.name || user.email.split('@')[0] || 'Campus student',
      email: user.email,
    }
  } catch {
    return null
  }
}

export async function signIn(email: string, password: string): Promise<UserProfile> {
  if (!isConfigured) {
    return MockService.signIn(email)
  }
  await account.createEmailPasswordSession(email, password)
  const user = await currentUser()
  if (!user) throw new Error('Failed to retrieve user after login')
  return user
}

export async function signUp(name: string, email: string, password: string): Promise<UserProfile> {
  if (!isConfigured) {
    return MockService.signUp(name, email)
  }
  await account.create(ID.unique(), email, password, name)
  return signIn(email, password)
}

export async function signOut(): Promise<void> {
  if (!isConfigured) {
    MockService.signOut()
    return
  }
  try {
    await account.deleteSession('current')
  } catch {}
}

// ─── Items & Feed ────────────────────────────────────────────────────────────

export async function getPublicLostItems(query = ''): Promise<Item[]> {
  if (!isConfigured) {
    return MockService.getPublicLostItems(query)
  }
  try {
    const queries = [
      Query.equal('type', ['lost']),
      Query.equal('status', ['open']),
      Query.orderDesc('$createdAt'),
      Query.limit(60),
    ]
    if (query.trim()) {
      queries.unshift(Query.search('title', query.trim()))
    }
    const result = await databases.listDocuments<ItemDocument>(
      config.databaseId,
      config.itemsCollectionId,
      queries
    )
    return result.documents.map(toItem)
  } catch (err) {
    console.error('Error fetching public lost items from Appwrite:', err)
    return MockService.getPublicLostItems(query)
  }
}

export async function getMyItems(userId: string): Promise<Item[]> {
  if (!isConfigured) {
    return MockService.getMyItems(userId)
  }
  try {
    const queries = [
      Query.equal('user_id', [userId]),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ]
    const result = await databases.listDocuments<ItemDocument>(
      config.databaseId,
      config.itemsCollectionId,
      queries
    )
    return result.documents.map(toItem)
  } catch (err) {
    console.error('Error fetching user items from Appwrite:', err)
    return MockService.getMyItems(userId)
  }
}

export async function uploadImage(userId: string, type: ItemType, file: File): Promise<string> {
  if (!isConfigured) {
    return URL.createObjectURL(file)
  }
  const permissions =
    type === 'lost'
      ? [
          Permission.read(Role.any()),
          Permission.read(Role.users()),
          Permission.update(Role.user(userId)),
          Permission.delete(Role.user(userId)),
        ]
      : [
          Permission.read(Role.user(userId)),
          Permission.update(Role.user(userId)),
          Permission.delete(Role.user(userId)),
        ]
  const result = await storage.createFile(config.bucketId, ID.unique(), file, permissions)
  return result.$id
}

export async function processImageWithAI(
  file: File,
  itemType: ItemType,
  description: string
): Promise<ProcessingResult | null> {
  const body = new FormData()
  body.append('file', file)
  body.append('item_type', itemType)
  body.append('user_description', description)

  try {
    const response = await fetch(`${aiApiUrl}/process-item`, { method: 'POST', body })
    if (response.ok) {
      return (await response.json()) as ProcessingResult
    }
  } catch (err) {
    console.warn('AI processing server unreachable, continuing with client-side metadata:', err)
  }
  return null
}

export async function createReport(input: {
  userId: string
  userName: string
  type: ItemType
  title: string
  description: string
  location: string
  occurredAt: string
  imagePath: string
  imageUrl?: string
  caption?: string
  embedding?: number[]
  ocrText?: string
  brand?: string
}): Promise<Item> {
  if (!isConfigured) {
    return MockService.createReport({
      userId: input.userId,
      userName: input.userName,
      type: input.type,
      title: input.title,
      description: input.description,
      location: input.location,
      occurredAt: input.occurredAt,
      imagePath: input.imagePath,
      imageUrl: input.imageUrl,
      caption: input.caption,
      ocrText: input.ocrText,
      brand: input.brand,
    })
  }

  const itemPermissions =
    input.type === 'lost'
      ? [
          Permission.read(Role.any()),
          Permission.read(Role.users()),
          Permission.update(Role.user(input.userId)),
          Permission.delete(Role.user(input.userId)),
        ]
      : [
          Permission.read(Role.user(input.userId)),
          Permission.update(Role.user(input.userId)),
          Permission.delete(Role.user(input.userId)),
        ]

  const doc = await databases.createDocument<ItemDocument>(
    config.databaseId,
    config.itemsCollectionId,
    ID.unique(),
    {
      user_id: input.userId,
      user_name: input.userName,
      type: input.type,
      title: input.title,
      description: input.description,
      location: input.location,
      occurred_at: input.occurredAt || '',
      image_path: input.imagePath,
      ai_caption: input.caption || '',
      ocr_text: input.ocrText || '',
      brand: input.brand || '',
      embedding: JSON.stringify(input.embedding || []),
      status: 'open',
    },
    itemPermissions
  )
  return toItem(doc)
}

export async function updateItemStatus(itemId: string, status: ItemStatus): Promise<void> {
  if (!isConfigured) {
    MockService.markReturned(itemId)
    return
  }
  await databases.updateDocument(config.databaseId, config.itemsCollectionId, itemId, {
    status,
  })
}

// ─── Private Verification & Claims ───────────────────────────────────────────

export async function saveFoundVerification(
  itemId: string,
  prompt: string,
  answer: string
): Promise<void> {
  if (!isConfigured) {
    MockService.saveFoundVerification(itemId, prompt, answer)
    return
  }
  const response = await secureFetch('/found-verifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ found_item_id: itemId, prompt, answer }),
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.detail || 'Could not securely save verification details')
  }
}

export async function reportFoundForLostItem(
  lostItem: Item,
  user: UserProfile,
  prompt: string,
  answer: string
): Promise<{ foundItem: Item; match: Match }> {
  if (!isConfigured) {
    return MockService.reportFoundForLostItem(lostItem, user, prompt, answer)
  }

  try {
    const response = await secureFetch(`/found-for-lost/${lostItem.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, answer }),
    })
    if (response.ok) {
      return (await response.json()) as { foundItem: Item; match: Match }
    }
  } catch (e) {
    console.warn('Direct AI server endpoint unavailable, using Appwrite fallback:', e)
  }

  // Appwrite SDK fallback: create found item using lost item's details
  const foundDoc = await createReport({
    userId: user.id,
    userName: user.name,
    type: 'found',
    title: lostItem.title,
    description: `Found item corresponding to lost report "${lostItem.title}".`,
    location: lostItem.location,
    occurredAt: new Date().toISOString(),
    imagePath: lostItem.image_path || 'inherited',
    imageUrl: lostItem.image_url || undefined,
    caption: lostItem.ai_caption || undefined,
  })

  await saveFoundVerification(foundDoc.id, prompt, answer)

  const match: Match = {
    id: String(Date.now()),
    lost_item_id: lostItem.id,
    found_item_id: foundDoc.id,
    similarity_score: 1.0,
    status: 'suggested',
    created_at: new Date().toISOString(),
    lost_item_title: lostItem.title,
    lost_item_location: lostItem.location,
  }

  return { foundItem: foundDoc, match }
}

export async function requestRanking(itemId: string): Promise<void> {
  if (!isConfigured) return
  try {
    await secureFetch(`/rank-report/${itemId}`, { method: 'POST' })
  } catch (e) {
    console.warn('Ranking request completed or skipped:', e)
  }
}

export async function matchesForLostItem(itemId: string): Promise<Match[]> {
  if (!isConfigured) {
    return MockService.getMatchesForLostItem(itemId)
  }
  try {
    const response = await secureFetch(`/matches/${itemId}`)
    if (!response.ok) {
      return []
    }
    return (await response.json()) as Match[]
  } catch {
    return []
  }
}

export async function startClaim(matchId: string): Promise<ClaimStart> {
  if (!isConfigured) {
    return MockService.startClaim(matchId)
  }
  const response = await secureFetch(`/claims/${matchId}/start`, { method: 'POST' })
  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.detail || 'This claim is not available')
  }
  return (await response.json()) as ClaimStart
}

export async function verifyClaim(claimId: string, answer: string): Promise<ClaimResult> {
  if (!isConfigured) {
    return MockService.verifyClaim(claimId, answer)
  }
  const response = await secureFetch(`/claims/${claimId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.detail || 'Verification attempt failed')
  }
  return (await response.json()) as ClaimResult
}

// ─── Messaging ───────────────────────────────────────────────────────────────

export async function getMessages(itemId: string, otherUserId: string): Promise<ChatMessage[]> {
  if (!isConfigured) {
    return MockService.getMessages(itemId)
  }
  const response = await secureFetch(`/messages/${itemId}/${otherUserId}`)
  if (!response.ok) throw new Error('Could not load chat messages')
  return (await response.json()) as ChatMessage[]
}

export async function sendMessage(
  itemId: string,
  senderId: string,
  senderName: string,
  receiverId: string,
  text: string
): Promise<ChatMessage> {
  if (!isConfigured) {
    return MockService.sendMessage(itemId, senderId, senderName, text)
  }
  const response = await secureFetch('/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item_id: itemId,
      receiver_id: receiverId,
      message: text.trim(),
    }),
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.detail || 'Could not send message')
  }
  return {
    id: String(Date.now()),
    sender_id: senderId,
    sender_name: senderName,
    message: text.trim(),
    created_at: new Date().toISOString(),
  }
}
