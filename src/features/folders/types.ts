import { z } from 'zod'

export const FolderSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  parentId: z.string().nullable().optional().default(null),
  createdAt: z.number(),
  isCollapsed: z.boolean().optional().default(false),
  isPinned: z.boolean().optional().default(false),
})

export type Folder = z.infer<typeof FolderSchema>

export const FolderListSchema = z.array(FolderSchema)

export const ConversationItemSchema = z.object({
  conversationId: z.string(),
  folderId: z.string().nullable(),
  title: z.string(),
  url: z.string(),
  updatedAt: z.number(),
})

export type ConversationItem = z.infer<typeof ConversationItemSchema>

export const ConversationMapSchema = z.record(z.string(), ConversationItemSchema)

export type ConversationMap = z.infer<typeof ConversationMapSchema>

export interface DragConversationData {
  conversationId: string
  title: string
  url: string
}
