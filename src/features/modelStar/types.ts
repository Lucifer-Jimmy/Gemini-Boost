import { z } from 'zod'

export const MODEL_MODES = ['Fast', 'Thinking', 'Pro'] as const

export const ModelModeSchema = z.enum(MODEL_MODES)

export type ModelMode = z.infer<typeof ModelModeSchema>