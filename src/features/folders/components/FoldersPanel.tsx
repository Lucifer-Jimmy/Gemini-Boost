import React, { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import styles from './FoldersPanel.module.css'
import { useFoldersLogic } from '../hooks/useFoldersLogic'
import { useHistoryDrag } from '../hooks/useHistoryDrag'
import { FolderTree } from './FolderTree'
import {
  extractChatId,
  extractChatInfo,
  extractConversationTitle,
  sanitizeConversationTitle,
} from '../utils/urlHelper'

export const FoldersPanel: React.FC = () => {
  const {
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
  } = useFoldersLogic()

  useHistoryDrag()

  const [isCreating, setIsCreating] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCreating) {
      inputRef.current?.focus()
    }
  }, [isCreating])

  const handleConfirmCreate = async (): Promise<void> => {
    const trimmed = newFolderName.trim()
    if (!trimmed) {
      return
    }

    await addFolder(trimmed)
    setNewFolderName('')
    setIsCreating(false)
  }

  const handleCancelCreate = (): void => {
    setNewFolderName('')
    setIsCreating(false)
  }

  const navigateToConversation = (url: string): void => {
    const conversationId = extractChatId(url)
    if (conversationId) {
      const conversations = document.querySelectorAll('[data-test-id="conversation"]')

      for (const conversation of Array.from(conversations)) {
        const element = conversation as HTMLElement
        const jslog = element.getAttribute('jslog')

        if (jslog && (jslog.includes(conversationId) || jslog.includes(`c_${conversationId}`))) {
          element.click()
          return
        }

        const nativeLink = element.querySelector(
          'a[href*="/app/"], a[href*="/gem/"]'
        ) as HTMLAnchorElement | null

        if (nativeLink?.href && nativeLink.href.includes(conversationId)) {
          element.click()
          return
        }
      }
    }

    window.location.assign(url)
  }

  const getNativeConversationSnapshot = (
    conversationId: string
  ): { title?: string; url?: string } | null => {
    const conversations = document.querySelectorAll('[data-test-id="conversation"]')

    for (const conversation of Array.from(conversations)) {
      const element = conversation as HTMLElement
      const jslog = element.getAttribute('jslog')
      const nativeLink = element.querySelector(
        'a[href*="/app/"], a[href*="/gem/"], a[href*="/chat/"]'
      ) as HTMLAnchorElement | null

      const byJslog = Boolean(
        jslog && (jslog.includes(conversationId) || jslog.includes(`c_${conversationId}`))
      )
      const byHref = Boolean(nativeLink?.href && nativeLink.href.includes(conversationId))

      if (!byJslog && !byHref) {
        continue
      }

      const info = nativeLink ? extractChatInfo(nativeLink, element) : null
      if (info) {
        return {
          title: info.title,
          url: info.url,
        }
      }

      // extractChatInfo 失败时，直接尝试从元素提取标题
      const directTitle = extractConversationTitle(element)
      if (directTitle) {
        return {
          title: directTitle,
          url: nativeLink?.href ? nativeLink.href : undefined,
        }
      }
    }

    return null
  }

  const getCurrentPageConversationSnapshot = (
    conversationId: string
  ): { title?: string; url?: string } | null => {
    const currentConversationId = extractChatId(window.location.href)
    if (!currentConversationId || currentConversationId !== conversationId) {
      return null
    }

    const pageTitle = document.title
      .replace(/\s*[|\-–—]\s*Gemini\s*$/i, '')
      .replace(/^Gemini\s*[|\-–—]\s*/i, '')
      .trim()

    const sanitizedPageTitle = sanitizeConversationTitle(pageTitle)

    if (!sanitizedPageTitle) {
      return {
        url: window.location.href,
      }
    }

    return {
      title: sanitizedPageTitle,
      url: window.location.href,
    }
  }

  const resolveBestConversationSnapshot = (
    conversationId: string
  ): { title?: string; url?: string } | null => {
    const nativeSnapshot = getNativeConversationSnapshot(conversationId)
    const nativeTitle = sanitizeConversationTitle(nativeSnapshot?.title)
    if (nativeTitle) {
      return nativeSnapshot
    }

    const pageSnapshot = getCurrentPageConversationSnapshot(conversationId)
    const pageTitle = sanitizeConversationTitle(pageSnapshot?.title)
    if (pageTitle) {
      return {
        title: pageTitle,
        url: nativeSnapshot?.url ?? pageSnapshot?.url,
      }
    }

    if (nativeSnapshot?.url || pageSnapshot?.url) {
      return {
        title: nativeSnapshot?.title,
        url: nativeSnapshot?.url ?? pageSnapshot?.url,
      }
    }

    return null
  }

  const watchNativeTitleAndSync = (
    folderId: string,
    conversationId: string,
    currentUrl?: string
  ): void => {
    const trySync = (): boolean => {
      const snapshot = resolveBestConversationSnapshot(conversationId)
      const nextTitle = sanitizeConversationTitle(snapshot?.title)
      if (!nextTitle) {
        return false
      }

      void moveConversationToFolder(
        conversationId,
        folderId,
        nextTitle,
        snapshot?.url ?? currentUrl
      )
      return true
    }

    if (trySync()) {
      return
    }

    const observer = new MutationObserver(() => {
      if (trySync()) {
        observer.disconnect()
        window.clearInterval(pollTimer)
      }
    })

    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    const pollTimer = window.setInterval(() => {
      if (trySync()) {
        observer.disconnect()
        window.clearInterval(pollTimer)
      }
    }, 250)

    window.setTimeout(() => {
      observer.disconnect()
      window.clearInterval(pollTimer)
    }, 10000)
  }

  const syncConversationTitleFromNative = (conversationId: string): string | null => {
    const conversations = document.querySelectorAll('[data-test-id="conversation"]')

    for (const conversation of Array.from(conversations)) {
      const element = conversation as HTMLElement
      const jslog = element.getAttribute('jslog')

      if (!jslog || (!jslog.includes(conversationId) && !jslog.includes(`c_${conversationId}`))) {
        continue
      }

      const title = extractConversationTitle(element)
      if (title && sanitizeConversationTitle(title)) {
        return title
      }
    }

    return null
  }

  const navigateToConversationById = (folderId: string, conversationId: string): void => {
    const conversation = getConversationsByFolder(folderId).find(
      (item) => item.conversationId === conversationId
    )

    if (!conversation) {
      console.error('[FoldersPanel] Conversation not found:', conversationId)
      return
    }

    const syncedTitleBeforeNav = syncConversationTitleFromNative(conversationId)
    const normalizedSyncedBefore = sanitizeConversationTitle(syncedTitleBeforeNav)
    const normalizedCurrent = sanitizeConversationTitle(conversation.title)
    if (normalizedSyncedBefore && normalizedSyncedBefore !== normalizedCurrent) {
      void moveConversationToFolder(
        conversation.conversationId,
        folderId,
        normalizedSyncedBefore,
        conversation.url
      )
    }

    navigateToConversation(conversation.url)

    setTimeout(() => {
      const syncedTitleAfterNav = syncConversationTitleFromNative(conversationId)
      const normalizedSyncedAfter = sanitizeConversationTitle(syncedTitleAfterNav)
      const normalizedCurrentAfter = sanitizeConversationTitle(conversation.title)
      if (normalizedSyncedAfter && normalizedSyncedAfter !== normalizedCurrentAfter) {
        void moveConversationToFolder(
          conversation.conversationId,
          folderId,
          normalizedSyncedAfter,
          conversation.url
        )
      }
    }, 300)
  }

  const handleDropConversation = async (
    conversationId: string,
    folderId: string,
    title?: string,
    url?: string
  ): Promise<void> => {
    const snapshot = resolveBestConversationSnapshot(conversationId)

    const effectiveTitle =
      sanitizeConversationTitle(title) ??
      sanitizeConversationTitle(snapshot?.title) ??
      undefined
    const effectiveUrl = snapshot?.url ?? url

    await moveConversationToFolder(conversationId, folderId, effectiveTitle, effectiveUrl)

    if (!sanitizeConversationTitle(effectiveTitle)) {
      watchNativeTitleAndSync(folderId, conversationId, effectiveUrl)
    }
  }

  return (
    <div className={styles.navItemContainer}>
      <div className={styles.headerPill}>
        <div className={styles.entryLabel} role="button" tabIndex={0} aria-label="Folders">
          <div className={clsx(styles.labelText, 'gds-label-l')}>Folders</div>
        </div>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className={styles.inlineAddButton}
          aria-label="添加文件夹"
          title="Add folders"
        >
          <svg className={styles.addIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M11 5h2v14h-2zM5 11h14v2H5z" />
          </svg>
        </button>
      </div>

      {isCreating && (
        <div className={styles.createFolderRow}>
          <input
            ref={inputRef}
            type="text"
            className={styles.nameInput}
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleConfirmCreate()
              }
              if (event.key === 'Escape') {
                handleCancelCreate()
              }
            }}
            placeholder="Folder name"
            aria-label="Folder name"
          />
          <div className={styles.iconButtonWrapper}>
            <button
              className={clsx(styles.actionButton, styles.confirmButton)}
              onClick={() => {
                void handleConfirmCreate()
              }}
              aria-label="Confirm"
              title="Confirm"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
              </svg>
            </button>
            <button
              className={clsx(styles.actionButton, styles.cancelButton)}
              onClick={handleCancelCreate}
              aria-label="Cancel"
              title="Cancel"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {!loading && (
        <FolderTree
          folders={folders}
          getConversationsByFolder={getConversationsByFolder}
          onToggleFolder={(folderId) => {
            void toggleFolder(folderId)
          }}
          onTogglePinFolder={(folderId) => {
            void togglePinFolder(folderId)
          }}
          onRenameFolder={(folderId, name) => {
            void renameFolder(folderId, name)
          }}
          onRemoveFolder={(folderId) => {
            void removeFolder(folderId)
          }}
          onRemoveConversation={(conversationId) => {
            void removeConversationFromFolder(conversationId)
          }}
          onDropConversation={(conversationId, folderId, title, url) => {
            void handleDropConversation(conversationId, folderId, title, url)
          }}
          onNavigateConversation={navigateToConversationById}
        />
      )}
    </div>
  )
}
