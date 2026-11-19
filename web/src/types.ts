export type ItemType = 'lost' | 'found'
export type ItemStatus = 'open' | 'claimed' | 'returned'

export interface Item {
  id: string
  type: ItemType
  title: string
  description: string
  image_path: string | null
  image_url?: string | null
  location: string
  occurred_at: string | null
  status: ItemStatus
  ai_caption: string | null
  ocr_text?: string | null
  brand?: string | null
  created_at: string
  user_id: string
  user_name?: string
}

export interface Match {
  id: string
  lost_item_id: string
  found_item_id: string
  similarity_score: number
  status: 'suggested' | 'claimed' | 'verified' | 'rejected'
  created_at: string
  lost_item_title?: string
  lost_item_location?: string
}

export interface ClaimStart {
  claim_id: string
  prompt: string
}

export interface ClaimResult {
  verified: boolean
  attempts_remaining: number
  found_item_id?: string
  finder_id?: string
  finder_name?: string
}

export interface ChatMessage {
  id: string
  sender_id: string
  sender_name?: string
  message: string
  created_at: string
}

export interface ConversationSummary {
  itemId: string
  itemTitle: string
  otherId: string
  otherName: string
  role: 'owner' | 'finder'
  status: ItemStatus
  lastMessage?: string
}

export interface UserProfile {
  id: string
  name: string
  email: string
}
