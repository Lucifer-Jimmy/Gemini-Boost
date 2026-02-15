import { useEffect, useRef } from 'react'
import { useDomObserver } from '../../../shared/hooks/useDomObserver'
import {
  DEFAULT_CONVERSATION_TITLE,
  extractChatInfo,
  extractConversationTitle,
} from '../utils/urlHelper'
import type { DragConversationData } from '../types'

const HISTORY_LINK_SELECTORS = [
  'a[href*="/app"]',
  'a[href*="gemini.google.com/app"]',
  'a[href*="/chat"]',
]

const DRAG_DATA_TYPE = 'text/plain'
const DRAG_JSON_TYPE = 'application/json'
const DRAG_ATTR = 'data-gs-draggable'
const TITLE_CACHE_ATTR = 'data-gs-title'
const CONVERSATION_ROW_SELECTOR = '[data-test-id="conversation"]'

const findHistoryContainer = (): HTMLElement | null => {
  const selector = HISTORY_LINK_SELECTORS.join(',')
  const historyAnchor = document.querySelector(selector)

  if (historyAnchor instanceof HTMLAnchorElement) {
    const host = historyAnchor.closest('nav, aside, div[role="navigation"]')
    if (host instanceof HTMLElement) {
      return host
    }
  }

  return null
}

/**
 * 预提取并缓存会话标题到 data 属性
 * 在 MutationObserver 每次触发时刷新，确保 dragstart 时能获取到最新标题
 */
const refreshCachedTitle = (element: HTMLElement, linkSelector: string): void => {
  const existing = element.getAttribute(TITLE_CACHE_ATTR)
  if (existing && existing !== DEFAULT_CONVERSATION_TITLE) {
    return
  }

  const anchor =
    element instanceof HTMLAnchorElement
      ? element
      : (element.querySelector(linkSelector) as HTMLAnchorElement | null)

  if (!anchor) return

  const chatInfo = extractChatInfo(anchor, element)
  if (chatInfo && chatInfo.title !== DEFAULT_CONVERSATION_TITLE) {
    element.setAttribute(TITLE_CACHE_ATTR, chatInfo.title)
  }
}

export const useHistoryDrag = (): void => {
  const handlersRef = useRef(new Map<HTMLElement, (event: DragEvent) => void>())

  // Clean up handlers for elements that are no longer in the DOM
  const cleanupStaleHandlers = (): void => {
    handlersRef.current.forEach((handler, anchor) => {
      if (!document.contains(anchor)) {
        anchor.removeEventListener('dragstart', handler)
        handlersRef.current.delete(anchor)
      }
    })
  }

  const applyDraggable = (): void => {
    cleanupStaleHandlers()

    const container = findHistoryContainer()
    if (!container) {
      return
    }
    
    const selector = HISTORY_LINK_SELECTORS.join(',')
    const conversationRows = Array.from(container.querySelectorAll(CONVERSATION_ROW_SELECTOR)).filter(
      (node): node is HTMLElement => node instanceof HTMLElement
    )

    const candidates =
      conversationRows.length > 0
        ? conversationRows
        : Array.from(container.querySelectorAll(selector)).filter(
            (node): node is HTMLElement => node instanceof HTMLElement
          )

    candidates.forEach((targetElement) => {
      if (targetElement.getAttribute(DRAG_ATTR) === 'true') {
        // 已注册拖拽的元素：刷新缓存标题（标题可能在首次注册时还未渲染）
        refreshCachedTitle(targetElement, selector)
        return
      }

      // 预提取并缓存标题
      refreshCachedTitle(targetElement, selector)

      const handler = (event: DragEvent): void => {
        if (!event.dataTransfer) return

        const anchor =
          targetElement instanceof HTMLAnchorElement
            ? targetElement
            : (targetElement.querySelector(selector) as HTMLAnchorElement | null)

        if (!anchor) return

        const chatInfo = extractChatInfo(anchor, targetElement)
        if (!chatInfo) return

        // 优先使用实时提取的标题，若为默认值则回退到缓存标题
        let finalTitle = chatInfo.title
        if (finalTitle === DEFAULT_CONVERSATION_TITLE) {
          const cached = targetElement.getAttribute(TITLE_CACHE_ATTR)
          if (cached && cached !== DEFAULT_CONVERSATION_TITLE) {
            finalTitle = cached
          }
        }

        // 二次兜底：直接从拖拽元素中提取可见文本
        if (finalTitle === DEFAULT_CONVERSATION_TITLE) {
          const directTitle = extractConversationTitle(targetElement)
          if (directTitle) {
            finalTitle = directTitle
            targetElement.setAttribute(TITLE_CACHE_ATTR, directTitle)
          }
        }

        const dragData: DragConversationData = {
          conversationId: chatInfo.chatId,
          title: finalTitle,
          url: chatInfo.url,
        }

        event.dataTransfer.setData(DRAG_JSON_TYPE, JSON.stringify(dragData))
        event.dataTransfer.setData(DRAG_DATA_TYPE, JSON.stringify(dragData))
        event.dataTransfer.setData('text/uri-list', chatInfo.url)
        event.dataTransfer.effectAllowed = 'copyMove'
      }

      targetElement.setAttribute('draggable', 'true')
      targetElement.setAttribute(DRAG_ATTR, 'true')
      targetElement.addEventListener('dragstart', handler)
      handlersRef.current.set(targetElement, handler)
    })
  }

  useDomObserver({ onMutation: applyDraggable })
  
  // Also run initially and cleanup on unmount
  useEffect(() => {
    const handlersMap = handlersRef.current

    applyDraggable()
    
    return () => {
        handlersMap.forEach((handler, anchor) => {
            anchor.removeEventListener('dragstart', handler)
        })
        handlersMap.clear()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
