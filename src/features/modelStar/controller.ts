import { getCurrentUserEmail } from '../../shared/services/userService'
import { modelStarStorageService } from './services/storage'
import { MODEL_MODES } from './types'
import type { ModelMode } from './types'

const STYLE_ID = 'gs-model-star-style'
const STAR_BUTTON_ATTR = 'data-gs-model-star'
const STAR_MODE_ATTR = 'data-gs-model-mode'
const TITLE_WRAPPER_CLASS = 'gs-model-title-wrap'
const STAR_ROW_ATTR = 'data-gs-model-star-row'
const SILENT_SWITCH_ATTR = 'data-gs-model-silent-switch'

const MODE_SET = new Set<ModelMode>(MODEL_MODES)

const normalizeText = (text: string | null | undefined): string => {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

const normalizeLower = (text: string | null | undefined): string => normalizeText(text).toLowerCase()

const asMode = (value: string): ModelMode | null => {
  return MODE_SET.has(value as ModelMode) ? (value as ModelMode) : null
}

const isVisible = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
}

const findClickableContainer = (label: HTMLElement): HTMLElement | null => {
  let current: HTMLElement | null = label
  for (let step = 0; step < 6; step += 1) {
    if (!current) {
      return null
    }

    const role = current.getAttribute('role')
    const tag = current.tagName.toLowerCase()
    if (
      tag === 'button' ||
      role === 'option' ||
      role === 'menuitemradio' ||
      role === 'radio' ||
      role === 'listitem' ||
      current.classList.contains('title-and-check')
    ) {
      return current
    }

    current = current.parentElement
  }

  return label.parentElement
}

const getModeLabels = (): Array<{
  mode: ModelMode
  label: HTMLElement
  row: HTMLElement
  titleContainer: HTMLElement
}> => {
  const labels = document.querySelectorAll('span.mode-title, span.gds-title-m, span[class*="mode-title"]')
  const result: Array<{
    mode: ModelMode
    label: HTMLElement
    row: HTMLElement
    titleContainer: HTMLElement
  }> = []

  for (const node of Array.from(labels)) {
    if (!(node instanceof HTMLElement) || !isVisible(node)) {
      continue
    }

    const mode = asMode(normalizeText(node.textContent))
    if (!mode) {
      continue
    }

    const row = findClickableContainer(node)
    if (!row || !isVisible(row)) {
      continue
    }

    const titleContainer = node.closest('.title-and-description') ?? node.parentElement
    if (!(titleContainer instanceof HTMLElement)) {
      continue
    }

    result.push({ mode, label: node, row, titleContainer })
  }

  return result
}

const getCurrentModelFromTriggerText = (): ModelMode | null => {
  const trigger = findModelTriggerButton()
  if (!trigger) {
    return null
  }

  const text = normalizeLower(trigger.textContent)
  for (const mode of MODEL_MODES) {
    if (text.includes(mode.toLowerCase())) {
      return mode
    }
  }

  return null
}

const findOpenMenuPanel = (): HTMLElement | null => {
  const panel = document.querySelector('.mat-mdc-menu-panel[role="menu"]')
  return panel instanceof HTMLElement ? panel : null
}

const waitForMenuPanel = async (timeoutMs: number): Promise<HTMLElement | null> => {
  const start = Date.now()
  while (Date.now() - start <= timeoutMs) {
    const panel = findOpenMenuPanel()
    if (panel) {
      return panel
    }

    await sleep(80)
  }

  return null
}

const ensureStyles = (): void => {
  if (document.getElementById(STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .${TITLE_WRAPPER_CLASS} {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: 100%;
    }

    .gs-model-star-btn {
      margin-left: 0;
      border: none;
      background: transparent;
      color: inherit;
      width: 20px;
      height: 20px;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0;
      font-size: 15px;
      line-height: 1;
      flex: 0 0 auto;
      vertical-align: middle;
      transform: scale(0.82);
      pointer-events: none;
      transition: background-color 0.18s cubic-bezier(0.2, 0, 0, 1), opacity 0.18s cubic-bezier(0.2, 0, 0, 1), transform 0.18s cubic-bezier(0.2, 0, 0, 1);
    }

    [${STAR_ROW_ATTR}="true"]:hover .gs-model-star-btn {
      opacity: 0.92;
      transform: scale(1);
      pointer-events: auto;
    }

    .gs-model-star-btn:hover {
      opacity: 1;
      background-color: rgba(68, 71, 70, 0.08);
      transform: scale(1.04);
    }

    .gs-model-star-btn:active {
      transform: scale(0.94);
    }

    .gs-model-star-btn-active {
      opacity: 1;
      transform: scale(1);
      pointer-events: auto;
      color: #f9ab00;
    }

    .gs-model-star-btn-active:hover {
      background-color: rgba(249, 171, 0, 0.12);
    }

    body[${SILENT_SWITCH_ATTR}="true"] .mat-mdc-menu-panel[role="menu"],
    body[${SILENT_SWITCH_ATTR}="true"] .cdk-overlay-backdrop {
      opacity: 0 !important;
      pointer-events: none !important;
      transition: none !important;
    }
  `

  document.head.appendChild(style)
}

const isNewConversationRoute = (): boolean => {
  const pathname = window.location.pathname
  return /^\/(u\/\d+\/)?app\/?$/.test(pathname)
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

const findModelTriggerButton = (): HTMLElement | null => {
  const directCandidates = [
    '.input-area-switch-label',
    '[data-test-id="model-selector"]',
    'button[aria-haspopup="menu"].mat-mdc-menu-trigger',
  ]

  for (const selector of directCandidates) {
    const candidate = document.querySelector(selector)
    if (candidate instanceof HTMLElement && isVisible(candidate)) {
      return candidate
    }
  }

  const buttons = document.querySelectorAll('button')
  for (const button of Array.from(buttons)) {
    if (!(button instanceof HTMLButtonElement) || !isVisible(button)) {
      continue
    }

    const text = normalizeLower(button.textContent)
    if (MODEL_MODES.some((mode) => text.includes(mode.toLowerCase()))) {
      return button
    }

    const ariaLabel = normalizeLower(button.getAttribute('aria-label'))
    if (ariaLabel.includes('model')) {
      return button
    }
  }

  return null
}

const clickModeOptionInPanel = (panel: HTMLElement, mode: ModelMode): boolean => {
  const items = panel.querySelectorAll('[role="menuitemradio"], .title-and-check')
  const target = mode.toLowerCase()

  for (const item of Array.from(items)) {
    if (!(item instanceof HTMLElement)) {
      continue
    }

    const label = item.querySelector('span.mode-title, span.gds-title-m, span[class*="mode-title"]')
    if (!(label instanceof HTMLElement)) {
      continue
    }

    if (normalizeLower(label.textContent) !== target) {
      continue
    }

    const clickable = findClickableContainer(label) ?? item
    const alreadySelected =
      clickable.getAttribute('aria-checked') === 'true' || clickable.classList.contains('is-selected')

    if (!alreadySelected) {
      clickable.click()
    } else {
      document.body.click()
    }

    return true
  }

  return false
}

class ModelStarController {
  private userId: string = 'unknown_user'
  private starredMode: ModelMode | null = null
  private observer: MutationObserver | null = null
  private routeWatchTimer: number | null = null
  private renderTimer: number | null = null
  private applyTimer: number | null = null
  private retryApplyTimer: number | null = null
  private lastHref: string = window.location.href
  private autoApplySessionKey: string | null = null
  private autoApplyAttempts = 0
  private isApplying = false
  private isSilentSwitching = false

  async start(): Promise<void> {
    ensureStyles()

    const email = await getCurrentUserEmail()
    this.userId = email || 'unknown_user'
    this.starredMode = await modelStarStorageService.getStarredMode(this.userId)

    this.observer = new MutationObserver(() => {
      this.scheduleRender()
      this.scheduleApply()
    })

    this.observer.observe(document.body, { childList: true, subtree: true })
    this.routeWatchTimer = window.setInterval(() => {
      if (window.location.href === this.lastHref) {
        return
      }

      this.lastHref = window.location.href
      this.scheduleRender()
      this.scheduleApply(true)
    }, 600)

    this.renderButtons()
    this.tryApplyStarredMode(true)
  }

  stop(): void {
    this.observer?.disconnect()
    this.observer = null

    if (this.routeWatchTimer !== null) {
      window.clearInterval(this.routeWatchTimer)
      this.routeWatchTimer = null
    }

    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer)
      this.renderTimer = null
    }

    if (this.applyTimer !== null) {
      window.clearTimeout(this.applyTimer)
      this.applyTimer = null
    }

    if (this.retryApplyTimer !== null) {
      window.clearInterval(this.retryApplyTimer)
      this.retryApplyTimer = null
    }

    this.setSilentSwitch(false)
  }

  private scheduleRender(): void {
    if (this.renderTimer !== null) {
      return
    }

    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null
      this.renderButtons()
    }, 120)
  }

  private scheduleApply(force = false): void {
    if (this.applyTimer !== null && !force) {
      return
    }

    if (this.applyTimer !== null) {
      window.clearTimeout(this.applyTimer)
      this.applyTimer = null
    }

    this.applyTimer = window.setTimeout(() => {
      this.applyTimer = null
      this.tryApplyStarredMode(force)
    }, 220)
  }

  private renderButtons(): void {
    const modeItems = getModeLabels()
    for (const { mode, row, label, titleContainer } of modeItems) {
      const hasExistingButton = Boolean(
        titleContainer.querySelector(`[${STAR_BUTTON_ATTR}="true"][${STAR_MODE_ATTR}="${mode}"]`)
      )

      row.setAttribute(STAR_ROW_ATTR, 'true')

      if (hasExistingButton) {
        continue
      }

      const wrapper = this.getOrCreateTitleWrapper(titleContainer, label)
      if (!wrapper) {
        continue
      }

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'gs-model-star-btn'
      button.setAttribute(STAR_BUTTON_ATTR, 'true')
      button.setAttribute(STAR_MODE_ATTR, mode)
      button.setAttribute('aria-label', `Star ${mode} as default mode`)

      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        void this.toggleMode(mode)
        button.blur()
      })

      wrapper.appendChild(button)
    }

    this.refreshButtons()
  }

  private getOrCreateTitleWrapper(
    titleContainer: HTMLElement,
    label: HTMLElement
  ): HTMLElement | null {
    let wrapper = titleContainer.querySelector(`.${TITLE_WRAPPER_CLASS}`) as HTMLElement | null
    if (wrapper instanceof HTMLElement) {
      return wrapper
    }

    wrapper = document.createElement('span')
    wrapper.className = TITLE_WRAPPER_CLASS

    if (!label.parentElement) {
      return null
    }

    label.insertAdjacentElement('beforebegin', wrapper)
    wrapper.appendChild(label)
    return wrapper
  }

  private refreshButtons(): void {
    const buttons = document.querySelectorAll(`button[${STAR_BUTTON_ATTR}="true"]`)
    for (const button of Array.from(buttons)) {
      if (!(button instanceof HTMLButtonElement)) {
        continue
      }

      const mode = asMode(button.getAttribute(STAR_MODE_ATTR) ?? '')
      const isActive = mode !== null && mode === this.starredMode
      button.textContent = isActive ? '★' : '☆'
      button.classList.toggle('gs-model-star-btn-active', isActive)
      button.title = isActive ? `${mode} is starred` : `Star ${mode}`
      button.setAttribute('aria-pressed', String(isActive))
    }
  }

  private setSilentSwitch(enabled: boolean): void {
    if (this.isSilentSwitching === enabled) {
      return
    }

    this.isSilentSwitching = enabled
    if (enabled) {
      document.body.setAttribute(SILENT_SWITCH_ATTR, 'true')
      return
    }

    document.body.removeAttribute(SILENT_SWITCH_ATTR)
  }

  private async toggleMode(mode: ModelMode): Promise<void> {
    this.starredMode = this.starredMode === mode ? null : mode
    await modelStarStorageService.setStarredMode(this.userId, this.starredMode)
    this.autoApplySessionKey = null
    this.autoApplyAttempts = 0
    this.refreshButtons()
    this.scheduleApply(true)
  }

  private async tryApplyStarredMode(force = false): Promise<void> {
    if (!this.starredMode || !isNewConversationRoute()) {
      return
    }

    const routeKey = `${window.location.pathname}${window.location.search}`
    if (!force && this.autoApplySessionKey === routeKey) {
      return
    }

    this.autoApplySessionKey = routeKey
    this.autoApplyAttempts = 0

    if (this.retryApplyTimer !== null) {
      window.clearInterval(this.retryApplyTimer)
      this.retryApplyTimer = null
    }

    this.retryApplyTimer = window.setInterval(() => {
      void this.applyStarredModeWithRetry(routeKey)
    }, 900)

    void this.applyStarredModeWithRetry(routeKey)
  }

  private async applyStarredModeWithRetry(routeKey: string): Promise<void> {
    if (this.retryApplyTimer === null) {
      return
    }

    if (!this.starredMode) {
      window.clearInterval(this.retryApplyTimer)
      this.retryApplyTimer = null
      this.setSilentSwitch(false)
      return
    }

    if (`${window.location.pathname}${window.location.search}` !== routeKey || !isNewConversationRoute()) {
      window.clearInterval(this.retryApplyTimer)
      this.retryApplyTimer = null
      this.setSilentSwitch(false)
      return
    }

    if (this.autoApplyAttempts >= 20) {
      window.clearInterval(this.retryApplyTimer)
      this.retryApplyTimer = null
      this.setSilentSwitch(false)
      return
    }

    this.setSilentSwitch(true)
    this.autoApplyAttempts += 1
    const applied = await this.applyMode(this.starredMode)
    if (applied) {
      window.clearInterval(this.retryApplyTimer)
      this.retryApplyTimer = null
      this.setSilentSwitch(false)
    }
  }

  private async applyMode(mode: ModelMode): Promise<boolean> {
    if (this.isApplying) {
      return false
    }

    const currentMode = getCurrentModelFromTriggerText()
    if (currentMode === mode) {
      return true
    }

    this.isApplying = true

    try {
    const trigger = findModelTriggerButton()
    if (!trigger) {
      return false
    }

    trigger.click()

    const panel = await waitForMenuPanel(1500)
    if (!panel) {
      return false
    }

    return clickModeOptionInPanel(panel, mode)
    } finally {
      this.isApplying = false
    }
  }
}

export const initializeModelStar = (): (() => void) => {
  const controller = new ModelStarController()
  void controller.start()
  return () => controller.stop()
}