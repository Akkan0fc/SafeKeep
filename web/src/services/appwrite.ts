import { Account, Client, Databases, ID, Permission, Query, Role, Storage } from 'appwrite'

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || ''
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || ''

export const isConfigured = Boolean(
  endpoint &&
  projectId &&
  !endpoint.includes('<REGION>') &&
  projectId !== 'your-project-id'
)

export const config = {
  endpoint,
  projectId,
  databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID || 'safekeep',
  itemsCollectionId: import.meta.env.VITE_APPWRITE_ITEMS_COLLECTION_ID || 'items',
  bucketId: import.meta.env.VITE_APPWRITE_BUCKET_ID || 'item_images',
}

const client = new Client()
  .setEndpoint(endpoint || 'https://cloud.appwrite.io/v1')
  .setProject(projectId || 'placeholder')

export const account = new Account(client)
export const databases = new Databases(client)
export const storage = new Storage(client)
export { ID, Permission, Query, Role }

const envAiUrl = import.meta.env.VITE_AI_API_URL || ''
export const aiApiUrl = (
  envAiUrl && !envAiUrl.includes('localhost')
    ? envAiUrl
    : typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : 'http://localhost:8000'
).replace(/\/$/, '')
