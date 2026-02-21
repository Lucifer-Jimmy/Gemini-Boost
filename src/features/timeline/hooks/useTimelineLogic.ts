import { useState, useEffect, useCallback, useRef } from 'react'

export interface TimelineItem {
  id: string
  text: string
  element: HTMLElement
}

export const useTimelineLogic = () => {
  const [items, setItems] = useState<TimelineItem[]>([])
  const timeoutRef = useRef<number | null>(null)

  const updateTimeline = useCallback(() => {
    const queryElements = document.querySelectorAll('div[role="heading"][aria-level="2"].query-text')
    const newItems: TimelineItem[] = []

    queryElements.forEach((el, index) => {
      if (!(el instanceof HTMLElement)) return

      const textElement = el.querySelector('.query-text-line')
      if (!textElement) return

      const text = textElement.textContent?.trim() || ''
      if (!text) return

      // Truncate text if it's too long (e.g., > 80 characters for multi-line)
      const maxLength = 80
      const displayText = text.length > maxLength ? `${text.substring(0, maxLength)}...` : text

      // Generate a unique ID based on index and text to avoid unnecessary re-renders
      const id = `timeline-item-${index}-${text.substring(0, 10)}`

      newItems.push({
        id,
        text: displayText,
        element: el
      })
    })

    setItems((prev) => {
      if (prev.length === newItems.length && prev.every((item, i) => item.id === newItems[i].id)) {
        return prev
      }
      return newItems
    })
  }, [])

  useEffect(() => {
    // Initial update
    requestAnimationFrame(updateTimeline)

    // Observe DOM changes to update timeline when new messages arrive
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
          shouldUpdate = true
          break
        }
      }
      if (shouldUpdate) {
        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = window.setTimeout(() => {
          updateTimeline()
        }, 300)
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })

    return () => {
      observer.disconnect()
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [updateTimeline])

  const scrollToItem = useCallback((item: TimelineItem) => {
    item.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  return {
    items,
    scrollToItem
  }
}
