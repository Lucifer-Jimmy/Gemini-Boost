import { z } from 'zod'
import { ConversationMapSchema, FolderListSchema } from '../types'
import { DEFAULT_CONVERSATION_TITLE, sanitizeConversationTitle } from '../utils/urlHelper'
import type { ConversationMap, Folder } from '../types'

const FOLDERS_KEY_PREFIX = 'gs_folders'
const CONVERSATIONS_KEY_PREFIX = 'gs_conversation_map'

const getKey = (base: string, userId: string) => `${base}_${userId}`

const getValidated = async <T>(
  key: string,
  schema: z.ZodSchema<T>,
  fallback: T
): Promise<T> => {
  const stored = await chrome.storage.local.get([key])
  const parsed = schema.safeParse(stored[key])
  return parsed.success ? parsed.data : fallback
}

type MoveConversationPayload = {
  conversationId: string
  folderId: string
  title?: string
  url?: string
}

export class StorageService {
  async getFolders(userId: string): Promise<Folder[]> {
    return getValidated(getKey(FOLDERS_KEY_PREFIX, userId), FolderListSchema, [])
  }

  async setFolders(userId: string, folders: Folder[]): Promise<void> {
    await chrome.storage.local.set({ [getKey(FOLDERS_KEY_PREFIX, userId)]: folders })
  }

  async getConversationMap(userId: string): Promise<ConversationMap> {
    return getValidated(
      getKey(CONVERSATIONS_KEY_PREFIX, userId),
      ConversationMapSchema,
      {}
    )
  }

  async setConversationMap(userId: string, conversationMap: ConversationMap): Promise<void> {
    await chrome.storage.local.set({
      [getKey(CONVERSATIONS_KEY_PREFIX, userId)]: conversationMap,
    })
  }

  async addFolder(userId: string, name: string, parentId: string | null = null): Promise<Folder[]> {
    const trimmed = name.trim()
    if (!trimmed) {
      return this.getFolders(userId)
    }

    const folders = await this.getFolders(userId)
    const nextFolders: Folder[] = [
      ...folders,
      {
        id: crypto.randomUUID(),
        name: trimmed,
        parentId,
        createdAt: Date.now(),
        isCollapsed: false,
        isPinned: false,
      },
    ]

    await this.setFolders(userId, nextFolders)
    return nextFolders
  }

  async renameFolder(userId: string, folderId: string, name: string): Promise<Folder[]> {
    const trimmed = name.trim()
    if (!trimmed) {
      return this.getFolders(userId)
    }

    const folders = await this.getFolders(userId)
    const nextFolders = folders.map((folder) =>
      folder.id === folderId ? { ...folder, name: trimmed } : folder
    )

    await this.setFolders(userId, nextFolders)
    return nextFolders
  }

  async toggleFolder(userId: string, folderId: string): Promise<Folder[]> {
    const folders = await this.getFolders(userId)
    const nextFolders = folders.map((folder) =>
      folder.id === folderId
        ? { ...folder, isCollapsed: !folder.isCollapsed }
        : folder
    )

    await this.setFolders(userId, nextFolders)
    return nextFolders
  }

  async togglePinFolder(userId: string, folderId: string): Promise<Folder[]> {
    const folders = await this.getFolders(userId)
    const nextFolders = folders.map((folder) =>
      folder.id === folderId
        ? { ...folder, isPinned: !folder.isPinned }
        : folder
    )

    await this.setFolders(userId, nextFolders)
    return nextFolders
  }

  async removeFolder(userId: string, folderId: string): Promise<{ folders: Folder[]; conversationMap: ConversationMap }> {
    const [folders, conversationMap] = await Promise.all([
      this.getFolders(userId),
      this.getConversationMap(userId),
    ])

    const nextFolders = folders.filter((folder) => folder.id !== folderId)
    const nextConversationMap: ConversationMap = {}

    Object.entries(conversationMap).forEach(([conversationId, conversation]) => {
      nextConversationMap[conversationId] =
        conversation.folderId === folderId
          ? { ...conversation, folderId: null, updatedAt: Date.now() }
          : conversation
    })

    await Promise.all([
      this.setFolders(userId, nextFolders),
      this.setConversationMap(userId, nextConversationMap),
    ])

    return {
      folders: nextFolders,
      conversationMap: nextConversationMap,
    }
  }

  async moveConversationToFolder(userId: string, payload: MoveConversationPayload): Promise<ConversationMap> {
    const trimmedConversationId = payload.conversationId.trim()
    if (!trimmedConversationId || !payload.folderId) {
      return this.getConversationMap(userId)
    }

    const conversationMap = await this.getConversationMap(userId)
    const previous = conversationMap[trimmedConversationId]
    const nextTitle =
      sanitizeConversationTitle(payload.title) ??
      sanitizeConversationTitle(previous?.title) ??
      DEFAULT_CONVERSATION_TITLE

    const nextConversationMap: ConversationMap = {
      ...conversationMap,
      [trimmedConversationId]: {
        conversationId: trimmedConversationId,
        folderId: payload.folderId,
        title: nextTitle,
        url: payload.url ?? previous?.url ?? `/app/${trimmedConversationId}`,
        updatedAt: Date.now(),
      },
    }

    await this.setConversationMap(userId, nextConversationMap)
    return nextConversationMap
  }

  async removeConversationFromFolder(userId: string, conversationId: string): Promise<ConversationMap> {
    const trimmedConversationId = conversationId.trim()
    if (!trimmedConversationId) {
      return this.getConversationMap(userId)
    }

    const conversationMap = await this.getConversationMap(userId)
    const target = conversationMap[trimmedConversationId]
    if (!target) {
      return conversationMap
    }

    const nextConversationMap: ConversationMap = {
      ...conversationMap,
      [trimmedConversationId]: {
        ...target,
        folderId: null,
        updatedAt: Date.now(),
      },
    }

    await this.setConversationMap(userId, nextConversationMap)
    return nextConversationMap
  }
}

export const storageService = new StorageService()
