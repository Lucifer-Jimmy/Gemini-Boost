# 星标默认模式（模型）机制说明

> 本文解释“当用户把某个模式设置为星标后，新对话会自动切换到该模式”的实现方式。
> 注意：这里的“星标”指的是**默认模型星标**，不是“星标消息历史”。

## 功能概览

流程可以概括为三步：

1. 在 Gemini 的“模式切换菜单”中注入星标按钮。
2. 用户点击星标后写入 `gvDefaultModel` 存储。
3. 新对话页面加载时自动读取存储并切换到对应模式。

## 入口与初始化

内容脚本初始化时会启动 `DefaultModelManager`：

```tsx
// src/pages/content/index.tsx
// Default Model Manager
DefaultModelManager.getInstance().init();
```

它负责：
- 监听模式切换菜单出现并注入星标按钮。
- 监听 SPA 导航 / 新对话进入时的自动切换。

## 存储键

默认模式星标被写入 `StorageKeys.DEFAULT_MODEL`（键名 `gvDefaultModel`）：

```ts
// src/core/types/common.ts
// Default Model
DEFAULT_MODEL: 'gvDefaultModel',
```

写入格式：
- 如果菜单项提供 `data-mode-id`，存成 `{ id, name }` 对象。
- 否则只存 `name` 字符串。

## 菜单注入与星标按钮

`DefaultModelManager` 通过 `MutationObserver` 监听菜单面板（`mat-mdc-menu-panel`）出现，
然后为每个 `menuitemradio` 注入星标按钮，并根据当前默认值更新星标状态。

```ts
// src/pages/content/defaultModel/modelLocker.ts
private initObserver() {
  this.observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue;

        const menuPanel = node.matches('.mat-mdc-menu-panel[role="menu"]')
          ? node
          : node.querySelector<HTMLElement>('.mat-mdc-menu-panel[role="menu"]');

        if (menuPanel) {
          this.scheduleMenuPanelInjection(menuPanel);
        }
      }
    }
  });

  this.observer.observe(document.body, { childList: true, subtree: true });
}
```

注入星标按钮：

```ts
// src/pages/content/defaultModel/modelLocker.ts
private async injectStarButtons(menuPanel: HTMLElement): Promise<boolean> {
  const items = menuPanel.querySelectorAll('[role="menuitemradio"]');
  if (!items.length) return false;

  if (!this.initialized) {
    const result = await storageService.get<unknown>(StorageKeys.DEFAULT_MODEL);
    this.currentDefaultModel = result.success ? this.parseStoredDefaultModel(result.data) : null;
    this.initialized = true;
  }

  const currentDefault = this.currentDefaultModel;

  items.forEach((item) => {
    const modelName = this.getModelNameFromItem(item as HTMLElement);
    if (!modelName) return;

    if (item.querySelector('.gv-default-star-btn')) {
      this.updateStarState(item as HTMLElement, modelName, currentDefault);
      return;
    }

    const btn = document.createElement('button');
    btn.className = 'gv-default-star-btn';
    btn.innerHTML = this.getStarIcon(false);
    btn.title = chrome.i18n.getMessage('setAsDefaultModel');

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await this.handleStarClick(modelName, btn);
    });

    const titleContainer = item.querySelector('.title-and-description');

    if (titleContainer) {
      const titleEl = titleContainer.querySelector('.mode-title');
      if (titleEl) {
        let wrapper = titleContainer.querySelector('.gv-title-wrapper') as HTMLElement;
        if (!wrapper) {
          wrapper = document.createElement('div');
          wrapper.className = 'gv-title-wrapper';
          wrapper.style.cssText = 'display: flex; align-items: center; width: 100%;';
          titleContainer.insertBefore(wrapper, titleEl);
          wrapper.appendChild(titleEl);
        }
        wrapper.appendChild(btn);
      } else {
        titleContainer.appendChild(btn);
      }
    } else {
      item.appendChild(btn);
    }

    this.updateStarState(item as HTMLElement, modelName, currentDefault);
  });

  return true;
}
```

## 点击星标：存储与 UI 更新

点击星标后会立即更新 UI 并写入存储：

```ts
// src/pages/content/defaultModel/modelLocker.ts
private async handleStarClick(modelName: string, btn: HTMLElement) {
  const closestItem = btn.closest('[role="menuitemradio"]');
  const modelItem = closestItem instanceof HTMLElement ? closestItem : null;
  const modelId = modelItem ? this.getModelIdFromItem(modelItem) : null;

  const isCurrentlyDefault = modelItem
    ? this.isDefaultForItem(this.currentDefaultModel, modelItem, modelName)
    : this.currentDefaultModel?.kind === 'name'
      ? this.currentDefaultModel.name === modelName
      : false;

  const nextDefault: DefaultModelSetting | null = isCurrentlyDefault
    ? null
    : modelId
      ? { kind: 'id', id: modelId, name: modelName }
      : { kind: 'name', name: modelName };

  this.currentDefaultModel = nextDefault;

  if (modelItem) {
    this.updateStarState(modelItem, modelName, nextDefault);
  }

  if (nextDefault) {
    this.showToast(chrome.i18n.getMessage('defaultModelSet', [modelName]));
  } else {
    this.showToast(chrome.i18n.getMessage('defaultModelCleared'));
  }

  const menuPanel = document.querySelector('.mat-mdc-menu-panel');
  if (menuPanel) {
    void this.injectStarButtons(menuPanel as HTMLElement);
  }

  if (isCurrentlyDefault) {
    await storageService.remove(StorageKeys.DEFAULT_MODEL);
  } else {
    if (nextDefault?.kind === 'id') {
      const toStore: StoredDefaultModelSetting = {
        id: nextDefault.id,
        name: nextDefault.name,
      };
      await storageService.set(StorageKeys.DEFAULT_MODEL, toStore);
    } else {
      await storageService.set(StorageKeys.DEFAULT_MODEL, modelName);
    }
  }
}
```

## 新对话自动切换机制

当进入新对话页面（`/app`）时，会读取星标模型并自动切换：

```ts
// src/pages/content/defaultModel/modelLocker.ts
private async checkAndLockModel() {
  if (!this.isNewConversation()) return;

  this.lastCheckedPath = window.location.pathname;

  const result = await storageService.get<unknown>(StorageKeys.DEFAULT_MODEL);
  const targetModel = result.success ? this.parseStoredDefaultModel(result.data) : null;
  this.currentDefaultModel = targetModel;
  this.initialized = true;

  if (!targetModel) return;

  if (this.isFastModel(targetModel)) {
    return;
  }

  const sessionId = `${window.location.pathname}-${Date.now()}`;
  this.autoSelectSessionId = sessionId;
  this.consecutiveFailures = 0;

  let attempts = 0;
  const maxAttempts = 20;

  if (this.checkTimer) clearInterval(this.checkTimer);

  this.checkTimer = window.setInterval(async () => {
    if (this.autoSelectSessionId !== sessionId) {
      if (this.checkTimer) clearInterval(this.checkTimer);
      return;
    }

    attempts++;
    if (attempts > maxAttempts) {
      if (this.checkTimer) clearInterval(this.checkTimer);
      return;
    }

    await this.tryLockToModel(targetModel);
  }, 1000);
}
```

### 新对话页面判定

```ts
// src/pages/content/defaultModel/modelLocker.ts
private isNewConversation() {
  const path = window.location.pathname;
  return /^\/(u\/\d+\/)?app\/?$/.test(path);
}
```

### 选择器点击与自动切换

自动切换会：
1. 找到模型选择器按钮并点击。
2. 打开菜单后按 `id` 或 `name` 精确匹配。
3. 找到目标项并点击完成切换。

```ts
// src/pages/content/defaultModel/modelLocker.ts
private async tryLockToModel(targetModel: DefaultModelSetting) {
  const normalize = (s: string) => s.toLowerCase().trim();
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const targetName = normalize(targetModel.name);
  const targetAsWholeWord = new RegExp(`(^|\\b)${escapeRegExp(targetName)}(\\b|$)`, 'i');

  const selectorBtn =
    document.querySelector('.input-area-switch-label') ||
    document.querySelector('[data-test-id="model-selector"]') ||
    document.querySelector('button[aria-haspopup="menu"].mat-mdc-menu-trigger');

  if (!selectorBtn) return;

  const currentText = selectorBtn.textContent || '';
  const normalizedCurrent = normalize(currentText);

  if (targetAsWholeWord.test(normalizedCurrent) || normalizedCurrent === targetName) {
    if (this.checkTimer) clearInterval(this.checkTimer);
    return;
  }

  if (this.isLocked) return;
  this.isLocked = true;

  try {
    (selectorBtn as HTMLElement).click();

    const menuPanel = await this.waitForModeSwitchMenuPanel(1500);
    if (!menuPanel) return;

    const items = menuPanel.querySelectorAll('[role="menuitemradio"]');
    let found = false;

    if (targetModel.kind === 'id') {
      const targetItem = Array.from(items).find((item) => {
        if (!(item instanceof HTMLElement)) return false;
        return this.getModelIdFromItem(item) === targetModel.id;
      });

      if (targetItem instanceof HTMLElement) {
        const alreadySelected =
          targetItem.getAttribute('aria-checked') === 'true' ||
          targetItem.classList.contains('is-selected');

        if (!alreadySelected) {
          targetItem.click();
        } else {
          document.body.click();
        }

        found = true;
      }
    } else {
      for (const item of Array.from(items)) {
        const modelName = this.getModelNameFromItem(item as HTMLElement);
        if (normalize(modelName) === targetName) {
          const alreadySelected =
            (item as HTMLElement).getAttribute('aria-checked') === 'true' ||
            (item as HTMLElement).classList.contains('is-selected');

          if (!alreadySelected) {
            (item as HTMLElement).click();
          } else {
            document.body.click();
          }
          found = true;
          break;
        }
      }
    }

    if (!found) {
      for (const item of Array.from(items)) {
        const text = (item as HTMLElement).textContent || '';
        if (targetAsWholeWord.test(normalize(text))) {
          const alreadySelected =
            (item as HTMLElement).getAttribute('aria-checked') === 'true' ||
            (item as HTMLElement).classList.contains('is-selected');

          if (!alreadySelected) {
            (item as HTMLElement).click();
          } else {
            document.body.click();
          }
          found = true;
          break;
        }
      }
    }

    if (found && this.checkTimer) {
      clearInterval(this.checkTimer);
      this.consecutiveFailures = 0;
    }

    if (!found) {
      document.body.click();
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        if (this.checkTimer) {
          clearInterval(this.checkTimer);
        }
      }
    }
  } catch (e) {
    console.error('Auto lock failed', e);
  } finally {
    this.isLocked = false;
  }
}
```

## SPA 导航监听（确保新对话也触发自动切换）

为了应对 Gemini 的 SPA 导航，`DefaultModelManager` 监听多种场景：

- `popstate`（浏览器前进后退）
- `history.pushState/replaceState`（内部路由）
- 侧边栏“新对话”点击
- 定时 URL 检查（兜底）

```ts
// src/pages/content/defaultModel/modelLocker.ts
public async init() {
  if (this.started) return;
  this.started = true;

  const result = await storageService.get<unknown>(StorageKeys.DEFAULT_MODEL);
  this.currentDefaultModel = result.success ? this.parseStoredDefaultModel(result.data) : null;
  this.initialized = true;

  this.initObserver();
  void this.checkAndLockModel();

  this.popStateHandler = () => {
    void this.checkAndLockModelWithDelay();
  };
  window.addEventListener('popstate', this.popStateHandler);

  if (!this.originalPushState) {
    this.originalPushState = history.pushState;
  }
  if (!this.originalReplaceState) {
    this.originalReplaceState = history.replaceState;
  }

  history.pushState = (...args: Parameters<History['pushState']>) => {
    this.originalPushState?.apply(history, args);
    void this.checkAndLockModelWithDelay();
  };
  history.replaceState = (...args: Parameters<History['replaceState']>) => {
    this.originalReplaceState?.apply(history, args);
    void this.checkAndLockModelWithDelay();
  };

  this.sidebarClickHandler = (e: Event) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a[href*="/app"]');
    if (link) {
      void this.checkAndLockModelWithDelay();
    }
  };
  document.addEventListener('click', this.sidebarClickHandler, true);

  this.urlCheckTimer = window.setInterval(() => {
    const currentPath = window.location.pathname;
    if (currentPath !== this.lastCheckedPath && this.isNewConversation()) {
      this.lastCheckedPath = currentPath;
      void this.checkAndLockModel();
    }
  }, 500);
}
```

## Fast/Flash 模型跳过自动切换

若星标模型是 Gemini 的默认 Flash/Fast 模型，则跳过自动切换：

```ts
// src/pages/content/defaultModel/modelLocker.ts
private isFastModel(model: DefaultModelSetting): boolean {
  if (model.kind === 'id') {
    return FAST_MODEL_IDS.has(model.id);
  }
  const normalizedName = model.name.toLowerCase().trim();
  return FAST_MODEL_NAMES.some(
    (fastName) => normalizedName === fastName || normalizedName.includes(fastName),
  );
}
```

## 小结

- 星标默认模式使用 `gvDefaultModel` 存储。
- 菜单注入星标按钮，点击后写入或清除存储。
- 新对话页 `/app` 触发自动切换到星标模式。
- SPA 导航通过多通道监听确保触发。
- Flash/Fast 默认模型会被跳过自动切换。
