import React, { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import styles from './FoldersPanel.module.css'
import {
  DEFAULT_CONVERSATION_TITLE,
  extractChatId,
  getDisplayConversationTitle,
  normalizeUrl,
  sanitizeConversationTitle,
} from '../utils/urlHelper'
import type { ConversationItem, Folder } from '../types'

type DropPayload = {
  conversationId: string
  title?: string
  url?: string
}

type FolderTreeProps = {
  folders: Folder[]
  getConversationsByFolder: (folderId: string) => ConversationItem[]
  onToggleFolder: (folderId: string) => void
  onTogglePinFolder: (folderId: string) => void
  onRenameFolder: (folderId: string, name: string) => void
  onRemoveFolder: (folderId: string) => void
  onRemoveConversation: (conversationId: string) => void
  onDropConversation: (
    conversationId: string,
    folderId: string,
    title?: string,
    url?: string
  ) => void
  onNavigateConversation: (folderId: string, conversationId: string) => void
}

const toDropPayload = (
  item: {
    conversationId?: string
    chatId?: string
    title?: string
    url?: string
  },
  fallbackTitle = DEFAULT_CONVERSATION_TITLE
): DropPayload | null => {
  const conversationId = item.conversationId ?? item.chatId
  if (!conversationId) {
    return null
  }

  return {
    conversationId,
    title: sanitizeConversationTitle(item.title) ?? fallbackTitle,
    url: item.url ? normalizeUrl(item.url) : undefined,
  }
}

const parseDropPayloads = (dataTransfer: DataTransfer): DropPayload[] => {
  const jsonData = dataTransfer.getData('application/json')
  if (jsonData) {
    try {
      const parsed = JSON.parse(jsonData) as {
        type?: string
        conversationId?: string
        chatId?: string
        title?: string
        url?: string
        conversations?: Array<{
          conversationId?: string
          chatId?: string
          title?: string
          url?: string
        }>
      }

      if (Array.isArray(parsed.conversations) && parsed.conversations.length > 0) {
        return parsed.conversations
          .map((item) => toDropPayload(item))
          .filter((item): item is DropPayload => item !== null)
      }

      const single = toDropPayload(parsed)
      if (single) {
        return [single]
      }
    } catch {
      // ignore JSON parse error and continue fallback parsing
    }
  }

  const textData = dataTransfer.getData('text/plain')
  if (textData) {
    try {
      const parsed = JSON.parse(textData) as {
        conversationId?: string
        chatId?: string
        title?: string
        url?: string
      }
      const fromJsonText = toDropPayload(parsed)
      if (fromJsonText) {
        return [fromJsonText]
      }
    } catch {
      const trimmed = textData.trim()
      if (trimmed.startsWith('http') || trimmed.startsWith('/')) {
        const conversationId = extractChatId(trimmed)
        if (conversationId) {
          return [
            {
              conversationId,
              title: DEFAULT_CONVERSATION_TITLE,
              url: normalizeUrl(trimmed),
            },
          ]
        }
      }
    }
  }

  const uriList = dataTransfer.getData('text/uri-list')
  if (uriList) {
    const firstUri = uriList
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'))

    if (firstUri) {
      const conversationId = extractChatId(firstUri)
      if (conversationId) {
        return [
          {
            conversationId,
            title: DEFAULT_CONVERSATION_TITLE,
            url: normalizeUrl(firstUri),
          },
        ]
      }
    }
  }

  return []
}

export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  getConversationsByFolder,
  onToggleFolder,
  onTogglePinFolder,
  onRenameFolder,
  onRemoveFolder,
  onRemoveConversation,
  onDropConversation,
  onNavigateConversation,
}) => {
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpenId) {
      return undefined
    }

    const handleClickOutside = () => {
      setMenuOpenId(null)
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [menuOpenId])

  useEffect(() => {
    if (!deletingId) {
      return undefined
    }

    const handleFocusOrPointerOutside = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }

      const row = target.closest(`[data-folder-row="${deletingId}"]`)
      if (!row) {
        setDeletingId(null)
      }
    }

    document.addEventListener('focusin', handleFocusOrPointerOutside)
    document.addEventListener('pointerdown', handleFocusOrPointerOutside)
    return () => {
      document.removeEventListener('focusin', handleFocusOrPointerOutside)
      document.removeEventListener('pointerdown', handleFocusOrPointerOutside)
    }
  }, [deletingId])

  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus()
    }
  }, [renamingId])

  const confirmRename = (folderId: string): void => {
    const trimmed = renameValue.trim()
    if (trimmed) {
      onRenameFolder(folderId, trimmed)
    }
    setRenamingId(null)
    setRenameValue('')
  }

  const cancelRename = (): void => {
    setRenamingId(null)
    setRenameValue('')
  }

  const foldersByParent = useMemo(() => {
    return folders.reduce<Record<string, Folder[]>>((acc, folder) => {
      const key = folder.parentId ?? '__root__'
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(folder)
      return acc
    }, {})
  }, [folders])

  const sortFolders = (items: Folder[]): Folder[] => {
    return [...items].sort((a, b) => {
      if (a.isPinned === b.isPinned) {
        return a.createdAt - b.createdAt
      }
      return a.isPinned ? -1 : 1
    })
  }

  const renderNodes = (parentId: string | null, depth: number): React.ReactNode => {
    const key = parentId ?? '__root__'
    const children = sortFolders(foldersByParent[key] ?? [])

    if (!children.length) {
      return null
    }

    return (
      <ul className={styles.folderList}>
        {children.map((folder) => {
          const conversations = getConversationsByFolder(folder.id)
          const hasChildren = Boolean((foldersByParent[folder.id] ?? []).length)

          return (
            <li key={folder.id}>
              <div
                className={clsx(
                  styles.folderItem,
                  dragOverFolderId === folder.id && styles.folderItemDragOver
                )}
                data-folder-row={folder.id}
                style={{ paddingLeft: `${12 + depth * 16}px` }}
                onClick={() => onToggleFolder(folder.id)}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragOverFolderId(folder.id)
                }}
                onDragLeave={() => setDragOverFolderId(null)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragOverFolderId(null)
                  const payloads = parseDropPayloads(event.dataTransfer)
                  if (!payloads.length) {
                    return
                  }

                  payloads.forEach((payload) => {
                    onDropConversation(
                      payload.conversationId,
                      folder.id,
                      payload.title,
                      payload.url
                    )
                  })
                }}
              >
                <div
                  className={clsx(styles.chevronIcon, !folder.isCollapsed && styles.expanded)}
                  aria-label={folder.isCollapsed ? 'Expand' : 'Collapse'}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 17l5-5-5-5v10z" />
                  </svg>
                </div>
                <div className={styles.folderIcon}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                  </svg>
                </div>
                {renamingId === folder.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    className={styles.folderNameEditable}
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Enter') {
                        confirmRename(folder.id)
                      }
                      if (event.key === 'Escape') {
                        cancelRename()
                      }
                    }}
                    onBlur={() => confirmRename(folder.id)}
                  />
                ) : (
                  <div className={styles.folderName} title={folder.name}>
                    {folder.name}
                  </div>
                )}
                <div className={styles.folderActions} onClick={(event) => event.stopPropagation()}>
                  {deletingId === folder.id ? (
                    <>
                      <button
                        className={clsx(styles.iconButton, styles.confirmButton)}
                        onClick={() => {
                          onRemoveFolder(folder.id)
                          setDeletingId(null)
                        }}
                        title="Confirm Delete"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
                        </svg>
                      </button>
                      <button
                        className={clsx(styles.iconButton, styles.cancelButton)}
                        onClick={() => setDeletingId(null)}
                        title="Cancel Delete"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={clsx(styles.iconButton, folder.isPinned && styles.iconButtonPinned)}
                        onClick={() => onTogglePinFolder(folder.id)}
                        title={folder.isPinned ? 'Unpin' : 'Pin'}
                      >
                        {folder.isPinned ? (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M14 4h-4v5.5L8 12v2h3.25V21l.75.75.75-.75V14H16v-2l-2-2.5V4z" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M14 4h-4v5.5L8 12v2h3.25V21l.75.75.75-.75V14H16v-2l-2-2.5V4zm-2 2h1v4.2l1.55 1.8h-5.1L11 10.2V6z" />
                          </svg>
                        )}
                      </button>
                      <button
                        className={styles.iconButton}
                        onClick={() => {
                          setMenuOpenId((prev) => (prev === folder.id ? null : folder.id))
                        }}
                        title="More options"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                        </svg>
                      </button>
                    </>
                  )}
                  {menuOpenId === folder.id && (
                    <div className={styles.popupMenu}>
                      <button
                        onClick={() => {
                          setRenamingId(folder.id)
                          setRenameValue(folder.name)
                          setMenuOpenId(null)
                          setDeletingId(null)
                        }}
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => {
                          setDeletingId(folder.id)
                          setMenuOpenId(null)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {(conversations.length > 0 || hasChildren) && (
                <div
                  className={clsx(
                    styles.folderChildren,
                    folder.isCollapsed && styles.folderChildrenCollapsed
                  )}
                  aria-hidden={folder.isCollapsed}
                >
                  <div className={styles.folderChildrenInner}>
                    {conversations.length > 0 && (
                      <ul className={styles.chatList}>
                        {conversations.map((conversation) => {
                          const displayTitle = getDisplayConversationTitle(conversation.title)

                          return (
                          <li key={conversation.conversationId} className={styles.chatItem}>
                            <a
                              href={conversation.url}
                              className={styles.chatLink}
                              title={displayTitle}
                              onClick={(event) => {
                                event.preventDefault()
                                onNavigateConversation(folder.id, conversation.conversationId)
                              }}
                            >
                              <span className={styles.chatTitle}>{displayTitle}</span>
                            </a>
                            <button
                              className={styles.removeChatButton}
                              onClick={() => onRemoveConversation(conversation.conversationId)}
                              title="Remove from folder"
                              aria-label="Remove from folder"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                              </svg>
                            </button>
                          </li>
                          )
                        })}
                      </ul>
                    )}
                    {hasChildren && renderNodes(folder.id, depth + 1)}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return <>{renderNodes(null, 0)}</>
}
