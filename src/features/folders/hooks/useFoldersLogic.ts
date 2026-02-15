import { useCallback, useEffect, useState } from 'react'
import { storageService } from '../services/storage'
import { getCurrentUserEmail } from '../../../shared/services/userService'
import type { ConversationItem, ConversationMap, Folder } from '../types'

type UseFoldersLogicResult = {
  folders: Folder[]
  loading: boolean
  addFolder: (name: string, parentId?: string | null) => Promise<void>
  renameFolder: (folderId: string, name: string) => Promise<void>
  removeFolder: (folderId: string) => Promise<void>
  toggleFolder: (folderId: string) => Promise<void>
  togglePinFolder: (folderId: string) => Promise<void>
  moveConversationToFolder: (
    conversationId: string,
    folderId: string,
    title?: string,
    url?: string
  ) => Promise<void>
  removeConversationFromFolder: (conversationId: string) => Promise<void>
  getConversationsByFolder: (folderId: string) => ConversationItem[]
}

export const useFoldersLogic = (): UseFoldersLogicResult => {
  const [folders, setFoldersState] = useState<Folder[]>([])
  const [conversationMap, setConversationMap] = useState<ConversationMap>({})
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const init = async (): Promise<void> => {
      const email = await getCurrentUserEmail()
      const currentUserId = email || 'unknown_user'
      setUserId(currentUserId)

      const [storedFolders, storedConversationMap] = await Promise.all([
        storageService.getFolders(currentUserId),
        storageService.getConversationMap(currentUserId),
      ])

      setFoldersState(storedFolders)
      setConversationMap(storedConversationMap)
      setLoading(false)
    }

    void init()
  }, [])

  const addFolder = useCallback(
    async (name: string, parentId: string | null = null) => {
      if (!userId) {
        return
      }

      const nextFolders = await storageService.addFolder(userId, name, parentId)
      setFoldersState(nextFolders)
    },
    [userId]
  )

  const renameFolder = useCallback(
    async (folderId: string, name: string) => {
      if (!userId) {
        return
      }

      const nextFolders = await storageService.renameFolder(userId, folderId, name)
      setFoldersState(nextFolders)
    },
    [userId]
  )

  const toggleFolder = useCallback(
    async (folderId: string) => {
      if (!userId) {
        return
      }

      const nextFolders = await storageService.toggleFolder(userId, folderId)
      setFoldersState(nextFolders)
    },
    [userId]
  )

  const togglePinFolder = useCallback(
    async (folderId: string) => {
      if (!userId) {
        return
      }

      const nextFolders = await storageService.togglePinFolder(userId, folderId)
      setFoldersState(nextFolders)
    },
    [userId]
  )

  const removeFolder = useCallback(
    async (folderId: string) => {
      if (!userId) {
        return
      }

      const nextState = await storageService.removeFolder(userId, folderId)
      setFoldersState(nextState.folders)
      setConversationMap(nextState.conversationMap)
    },
    [userId]
  )

  const moveConversationToFolder = useCallback(
    async (conversationId: string, folderId: string, title?: string, url?: string) => {
      if (!userId || !conversationId || !folderId) {
        return
      }

      const nextConversationMap = await storageService.moveConversationToFolder(userId, {
        conversationId,
        folderId,
        title,
        url,
      })
      setConversationMap(nextConversationMap)
    },
    [userId]
  )

  const removeConversationFromFolder = useCallback(
    async (conversationId: string) => {
      if (!userId) {
        return
      }

      const nextConversationMap = await storageService.removeConversationFromFolder(
        userId,
        conversationId
      )
      setConversationMap(nextConversationMap)
    },
    [userId]
  )

  const getConversationsByFolder = useCallback(
    (folderId: string): ConversationItem[] => {
      return Object.values(conversationMap)
        .filter((conversation) => conversation.folderId === folderId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
    },
    [conversationMap]
  )

  return {
    folders,
    loading,
    addFolder,
    renameFolder,
    removeFolder,
    toggleFolder,
    togglePinFolder,
    moveConversationToFolder,
    removeConversationFromFolder,
    getConversationsByFolder,
  }
}
