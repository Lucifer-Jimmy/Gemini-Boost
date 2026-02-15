# Drag-to-folder title capture flow

This document explains how Gemini Voyager captures a conversation title while dragging a history item into a folder, and which code paths are involved. It includes key code snippets for reference.

## High-level flow (end-to-end)

1. The sidebar conversation items are made draggable and wired with drag handlers.
2. On drag start, the code reads the title directly from the DOM and packages it into drag data.
3. The drop zone reads the drag data and routes it to add logic.
4. The folder storage writes the conversation reference with the captured title.
5. Folder rendering uses the stored title and may resync from native DOM later.

## 1) Make native conversations draggable

Native conversation items in the Gemini sidebar are discovered and attached with drag listeners.

```typescript
private makeConversationsDraggable(): void {
  if (!this.sidebarContainer) return;

  const conversations = this.sidebarContainer.querySelectorAll('[data-test-id="conversation"]');
  conversations.forEach((conv) => {
    this.makeConversationDraggable(conv as HTMLElement);
    // ... (hide-archived handling)
  });
}
```

Key file:
- src/pages/content/folder/manager.ts

## 2) Capture title and build drag data on dragstart

On drag start, the title is pulled from DOM and placed into a `DragData` payload. This is the exact moment where the title is captured.

```typescript
element.addEventListener('dragstart', (e) => {
  const title = element.querySelector('.conversation-title')?.textContent?.trim() || 'Untitled';
  const conversationId = this.extractConversationId(element);

  // Extract URL and conversation metadata together
  const conversationData = this.extractConversationData(element);

  const dragData: DragData = {
    type: 'conversation',
    conversationId,
    title,
    url: conversationData.url,
    isGem: conversationData.isGem,
    gemId: conversationData.gemId,
  };

  e.dataTransfer?.setData('application/json', JSON.stringify(dragData));
});
```

Multi-select drag uses the same idea, iterating through selected conversations and reading their titles from DOM:

```typescript
this.selectedConversations.forEach((id) => {
  const convEl = this.findConversationElement(id);
  if (convEl) {
    const convTitle =
      convEl.querySelector('.conversation-title')?.textContent?.trim() || 'Untitled';
    const convData = this.extractConversationData(convEl);

    selectedConvs.push({
      conversationId: id,
      title: convTitle,
      url: convData.url,
      addedAt: Date.now(),
      isGem: convData.isGem,
      gemId: convData.gemId,
    });
  }
});
```

## 3) Drop zone parses drag data and routes it

When the user drops onto a folder (or root), the drop handler parses `application/json`, then routes the conversation data to add methods.

```typescript
element.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();

  const data = e.dataTransfer?.getData('application/json');
  if (!data) return;

  const dragData: DragData = JSON.parse(data);

  if (dragData.conversations && dragData.conversations.length > 0) {
    this.addConversationsToFolder(folderId, dragData.conversations, dragData.sourceFolderId);
  } else {
    this.addConversationToFolder(folderId, dragData);
  }
});
```

## 4) Store the captured title in folder data

The folder storage writes a `ConversationReference` using the title captured during dragstart.

```typescript
const conv: ConversationReference = {
  conversationId: dragData.conversationId!,
  title: dragData.title,
  url: dragData.url!,
  addedAt: Date.now(),
  isGem: dragData.isGem,
  gemId: dragData.gemId,
};

this.data.folderContents[folderId].push(conv);
this.saveData();
this.refresh();
```

Multi-select uses the `conversations` array and pushes copies with updated timestamps:

```typescript
conversations.forEach((conv) => {
  const exists = this.data.folderContents[folderId].some(
    (c) => c.conversationId === conv.conversationId,
  );

  if (!exists) {
    this.data.folderContents[folderId].push({
      ...conv,
      addedAt: Date.now(),
    });
  }
});
```

## 5) Render the stored title (and optional resync)

The folder UI renders `conv.title` and may resync from native DOM to keep titles up to date.

```typescript
let displayTitle = conv.title;
if (!conv.customTitle && !this.hideArchivedConversations) {
  const syncedTitle = this.syncConversationTitleFromNative(conv.conversationId);
  if (syncedTitle && syncedTitle !== conv.title) {
    conv.title = syncedTitle;
    displayTitle = syncedTitle;
    this.pendingTitleUpdates.set(conv.conversationId, syncedTitle);
  }
}
```

## Summary

- The title is captured at dragstart directly from the native sidebar DOM.
- That title is embedded in `DragData` and written into `ConversationReference` on drop.
- Folder rendering uses the stored title immediately, with optional resync later.

## Key files

- src/pages/content/folder/manager.ts
