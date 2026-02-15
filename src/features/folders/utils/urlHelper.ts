/**
 * URL 处理工具函数
 * 用于从 Gemini 历史记录链接中提取和规范化 URL
 */

export const DEFAULT_CONVERSATION_TITLE = 'Untitled Chat'

/**
 * 从绝对或相对 URL 中提取 chatId
 * 支持格式：/app/{chatId} 和 /u/{num}/app/{chatId}
 * @param url - 可能是 /app/{chatId} 或完整 URL
 * @returns chatId 或 null
 */
export const extractChatId = (url: string): string | null => {
  if (!url) return null

  try {
    const parsePath = (pathname: string): string | null => {
      const appMatch = pathname.match(/\/(?:u\/\d+\/)?app\/([^/?#]+)/)
      if (appMatch?.[1]) {
        return appMatch[1]
      }

      const gemMatch = pathname.match(/\/(?:u\/\d+\/)?gem\/[^/]+\/([^/?#]+)/)
      if (gemMatch?.[1]) {
        return gemMatch[1]
      }

      return null
    }

    // 处理完整 URL
    if (url.startsWith('http')) {
      const urlObj = new URL(url)
      const id = parsePath(urlObj.pathname)
      return id ? id.replace(/^c_/, '') : null
    }

    // 处理相对路径：支持 /app/{id}、/u/{n}/app/{id}、/gem/{gemId}/{id}
    const id = parsePath(url)
    return id ? id.replace(/^c_/, '') : null
  } catch {
    return null
  }
}

/**
 * 规范化 URL 为相对路径
 * 保留账户路径（如 /u/2/）以确保多账户访问正确
 * 如果当前页面在账户路径下，自动为相对路径添加账户前缀
 * @param url - 原始 URL（可能是绝对或相对路径）
 * @returns 规范化的相对路径
 */
export const normalizeUrl = (url: string): string => {
  if (!url) return ''

  try {
    // 始终返回绝对 URL，确保在任何上下文中都能访问
    if (url.startsWith('http')) {
      return url
    }

    // 确保以 / 开头
    const path = url.startsWith('/') ? url : `/${url}`
    
    // 如果是相对路径 /app/xxx，检查当前页面是否在账户路径下
    if (path.startsWith('/app/')) {
        // 尝试从当前 URL 获取账户前缀 (e.g. /u/1/)
        const currentPath = window.location.pathname
        const accountMatch = currentPath.match(/^\/u\/\d+\//)
        if (accountMatch) {
            return `https://gemini.google.com${accountMatch[0]}app/${path.substring(5)}`
        }
    }

    return `https://gemini.google.com${path}`
  } catch {
    return url.startsWith('http') ? url : `https://gemini.google.com/${url}`
  }
}

const normalizeTitleText = (text: string): string => {
  return text.replace(/\s+/g, ' ').trim()
}

const isValidConversationTitle = (text: string): boolean => {
  if (!text) {
    return false
  }

  const normalized = normalizeTitleText(text)
  if (!normalized || normalized === DEFAULT_CONVERSATION_TITLE || normalized === 'Gemini') {
    return false
  }

  // Allow http if it's the only available text? No, user prefers "Untitled Chat" over raw URL usually.
  if (normalized.startsWith('http') && !normalized.includes(' ')) {
    return false
  }

  const invalidLabels = new Set(['More options', 'Pin', 'Unpin', 'Delete', 'Rename'])
  return !invalidLabels.has(normalized)
}

export const sanitizeConversationTitle = (title?: string | null): string | null => {
  if (!title) {
    return null
  }

  const normalized = normalizeTitleText(title)
  return isValidConversationTitle(normalized) ? normalized : null
}

export const getDisplayConversationTitle = (title?: string | null): string => {
  return sanitizeConversationTitle(title) ?? DEFAULT_CONVERSATION_TITLE
}

const getSanitizedText = (element: Element | null): string | null => {
  if (!element) {
    return null
  }

  const clone = element.cloneNode(true) as HTMLElement
  // Clean up common noise elements
  clone.querySelectorAll('.conversation-title-cover, button, svg, [aria-hidden="true"], [role="img"]').forEach((node) => {
    node.remove()
  })

  // Also remove elements with "more options" related classes or attributes if possible
  // (Assuming standard Gemini classes are stable enough or covered by above)

  const text = normalizeTitleText(clone.textContent ?? '')
  return isValidConversationTitle(text) ? text : null
}

export const extractConversationTitle = (rootElement: HTMLElement): string | null => {
  // 1. 优先检查 rootElement 自身的属性 (针对 rootElement 就是 anchor 的情况)
  const rootTitle = sanitizeConversationTitle(rootElement.getAttribute('title'))
  if (rootTitle) return rootTitle

  const rootAriaLabel = sanitizeConversationTitle(rootElement.getAttribute('aria-label'))
  if (rootAriaLabel) return rootAriaLabel

  // 2. 尝试已知 CSS 选择器
  const prioritySelectors = [
    '[data-test-id="conversation-title"]',
    '.conversation-title',
    '[class*="conversation-title"]',
  ]

  for (const selector of prioritySelectors) {
    const title = getSanitizedText(rootElement.querySelector(selector))
    if (title) return title
  }

  // 3. 尝试 [dir="auto"] 元素 (Google 常用的用户文本容器模式)
  const dirAutoElements = rootElement.querySelectorAll('[dir="auto"]')
  for (const el of Array.from(dirAutoElements)) {
    const text = getSanitizedText(el)
    if (text) return text
  }

  // 4. 尝试会话链接的文本内容 (比整行文本更精准，可避免时间戳等噪声)
  const conversationAnchors = rootElement.querySelectorAll(
    'a[href*="/app/"], a[href*="/gem/"], a[href*="/chat/"]'
  )
  for (const anchor of Array.from(conversationAnchors)) {
    const el = anchor as HTMLElement
    const aTitle = sanitizeConversationTitle(el.getAttribute('title'))
    if (aTitle) return aTitle
    const aLabel = sanitizeConversationTitle(el.getAttribute('aria-label'))
    if (aLabel) return aLabel
    // innerText 只返回可见文本，避免 aria-hidden 等隐藏文本干扰
    const aInnerText = sanitizeConversationTitle(el.innerText)
    if (aInnerText) return aInnerText
    const aText = getSanitizedText(el)
    if (aText) return aText
  }

  // 5. 检查内部链接的 title / aria-label 属性
  const innerAnchor = rootElement.querySelector('a[title], a[aria-label]') as HTMLAnchorElement | null
  if (innerAnchor) {
    const titleAttr = sanitizeConversationTitle(
      innerAnchor.title || innerAnchor.getAttribute('aria-label') || ''
    )
    if (titleAttr) return titleAttr
  }

  // 6. 如果 rootElement 自身就是 anchor，直接取其文本
  if (rootElement instanceof HTMLAnchorElement) {
    const anchorInnerText = sanitizeConversationTitle(rootElement.innerText)
    if (anchorInnerText) return anchorInnerText
    const anchorText = getSanitizedText(rootElement)
    if (anchorText) return anchorText
  }

  // 7. 最终兜底：取整个元素的清洗文本
  const fallback = getSanitizedText(rootElement)
  return fallback && isValidConversationTitle(fallback) ? fallback : null
}

/**
 * 从 anchor 元素中提取聊天信息
 * @param anchor - HTML anchor 元素
 * @returns 聊天信息对象或 null
 */
export const extractChatInfo = (
  anchor: HTMLAnchorElement,
  sourceElement?: HTMLElement
): { chatId: string; title: string; url: string } | null => {
  const href = anchor.getAttribute('href')
  if (!href) return null

  const chatId = extractChatId(href)
  if (!chatId) return null

  const conversationRoot =
    sourceElement?.closest('[data-test-id="conversation"]') ??
    anchor.closest('[data-test-id="conversation"]') ??
    sourceElement ??
    anchor

  const titleContainer =
    conversationRoot instanceof HTMLElement ? conversationRoot : anchor

  // 逐级降级提取标题：容器 → anchor 元素 → anchor 原始文本
  let title = extractConversationTitle(titleContainer)

  if (!title && titleContainer !== (anchor as HTMLElement)) {
    title = extractConversationTitle(anchor)
  }

  if (!title) {
    title = sanitizeConversationTitle(anchor.textContent)
  }

  // 规范化 URL - 保留或添加账户路径
  const url = normalizeUrl(href)

  return { chatId, title: title ?? DEFAULT_CONVERSATION_TITLE, url }
}
