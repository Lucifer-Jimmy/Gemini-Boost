import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FoldersPanel } from '../../features/folders'
import { useDomObserver } from '../../shared/hooks/useDomObserver'

const SIDEBAR_HOST_SELECTORS = [
  'infinite-scroller',
  'nav[aria-label*="History"]',
  'nav[aria-label*="history"]',
  'nav[aria-label*="Chats"]',
  'aside[aria-label*="History"]',
  'div[role="navigation"]',
]

const MOUNT_ID = 'gs-folders-root'

const findSidebarHost = (): HTMLElement | null => {
  const scroller = document.querySelector('infinite-scroller')
  if (scroller instanceof HTMLElement) {
    return scroller
  }

  const historyAnchor = document.querySelector(
    'a[href*="/app"], a[href*="gemini.google.com/app"]'
  )
  if (historyAnchor instanceof HTMLAnchorElement) {
    const host = historyAnchor.closest('nav, aside, div[role="navigation"]')
    if (host instanceof HTMLElement) {
      return host
    }
  }

  for (const selector of SIDEBAR_HOST_SELECTORS) {
    const host = document.querySelector(selector)
    if (host instanceof HTMLElement) {
      return host
    }
  }

  return null
}

const getOrCreateMount = (host: HTMLElement): HTMLElement => {
  const existing = host.querySelector(`#${MOUNT_ID}`)
  if (existing instanceof HTMLElement) {
    return existing
  }

  const mount = document.createElement('div')
  mount.id = MOUNT_ID
  mount.setAttribute('data-gs-mount', 'folders')
  const insertBefore = host.querySelector('.chat-history')
  if (insertBefore instanceof HTMLElement) {
    host.insertBefore(mount, insertBefore)
  } else {
    host.appendChild(mount)
  }
  return mount
}

export const App: React.FC = () => {
  const [mount, setMount] = useState<HTMLElement | null>(null)

  const updateMount = useCallback(() => {
    const host = findSidebarHost()
    if (!host) {
      setMount((prev) => (prev ? null : prev))
      return
    }
    const next = getOrCreateMount(host)
    setMount((prev) => (prev === next ? prev : next))
  }, [])

  useEffect(() => {
    updateMount()
  }, [updateMount])

  useDomObserver({ root: document.body, onMutation: updateMount })

  if (!mount) {
    return null
  }

  return createPortal(<FoldersPanel />, mount)
}
