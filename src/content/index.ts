import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FoldersPanel } from '../features/folders'
import { initializeModelStar } from '../features/modelStar'
import { Timeline } from '../features/timeline'

const MOUNT_ID = 'gs-folders-root'
const TIMELINE_MOUNT_ID = 'gs-timeline-root'

const SIDEBAR_HOST_SELECTORS = [
	'infinite-scroller',
	'nav[aria-label*="History"]',
	'nav[aria-label*="history"]',
	'nav[aria-label*="Chats"]',
	'aside[aria-label*="History"]',
	'div[role="navigation"]',
]

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

let root: Root | null = null
let mountedElement: HTMLElement | null = null

let timelineRoot: Root | null = null
let timelineMountedElement: HTMLElement | null = null

const getOrCreateTimelineMount = (): HTMLElement => {
	const existing = document.getElementById(TIMELINE_MOUNT_ID)
	if (existing) {
		return existing
	}

	const mount = document.createElement('div')
	mount.id = TIMELINE_MOUNT_ID
	mount.setAttribute('data-gs-mount', 'timeline')
	document.body.appendChild(mount)

	return mount
}

const mountTimeline = (): void => {
	const mount = getOrCreateTimelineMount()

	if (timelineMountedElement === mount && timelineRoot) {
		return
	}

	if (timelineRoot) {
		timelineRoot.unmount()
	}

	timelineRoot = createRoot(mount)
	timelineRoot.render(createElement(Timeline))
	timelineMountedElement = mount
}

const mountFoldersTree = (): void => {
	const host = findSidebarHost()
	if (!host) {
		return
	}

	const mount = getOrCreateMount(host)

	if (mountedElement === mount && root) {
		return
	}

	if (root) {
		root.unmount()
	}

	root = createRoot(mount)
	root.render(createElement(FoldersPanel))
	mountedElement = mount
}

const observer = new MutationObserver(() => {
	mountFoldersTree()
	mountTimeline()
})

observer.observe(document.body, { childList: true, subtree: true })
mountFoldersTree()
mountTimeline()

const cleanupModelStar = initializeModelStar()

window.addEventListener('beforeunload', () => {
	observer.disconnect()
	root?.unmount()
	timelineRoot?.unmount()
	cleanupModelStar()
})
