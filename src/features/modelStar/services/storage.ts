import { z } from 'zod'
import { ModelModeSchema } from '../types'
import type { ModelMode } from '../types'

const STARRED_MODEL_MODE_KEY_PREFIX = 'gs_starred_model_mode'

const getKey = (userId: string): string => `${STARRED_MODEL_MODE_KEY_PREFIX}_${userId}`

const StarredModelModeSchema = z.union([ModelModeSchema, z.null()])

const getValidated = async <T>(
  key: string,
  schema: z.ZodSchema<T>,
  fallback: T
): Promise<T> => {
  const stored = await chrome.storage.local.get([key])
  const parsed = schema.safeParse(stored[key])
  return parsed.success ? parsed.data : fallback
}

export class ModelStarStorageService {
  async getStarredMode(userId: string): Promise<ModelMode | null> {
    return getValidated(getKey(userId), StarredModelModeSchema, null)
  }

  async setStarredMode(userId: string, mode: ModelMode | null): Promise<void> {
    await chrome.storage.local.set({ [getKey(userId)]: mode })
  }
}

export const modelStarStorageService = new ModelStarStorageService()