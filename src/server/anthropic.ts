// Server only. Import from src/routes/api/* handlers, never from components.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'

export const MODELS = {
  fast: 'claude-haiku-4-5', // frame → screen events
  policy: 'claude-sonnet-5-5', // which question to ask at a pause
  deep: 'claude-opus-5-5', // debrief gaps, Work Map, teach-back, guardrail compile
} as const

export type ModelId = (typeof MODELS)[keyof typeof MODELS]

let client: Anthropic | null = null

/** Reads ANTHROPIC_API_KEY from the environment (Railway variables, or .env locally). */
export const anthropic = () => {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      try {
        process.loadEnvFile() // local dev: .env in the project root
      } catch {
        // no .env file: fall through to the SDK's own credential lookup
      }
    }
    // Keys that are not scoped to a workspace need the workspace id on every request.
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID
    client = new Anthropic(workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {})
  }
  return client
}

/** A base64 JPEG (without the data: prefix) as an image block. */
export const jpegBlock = (base64: string): Anthropic.ImageBlockParam => ({
  type: 'image',
  source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
})

interface JsonOptions<T extends z.ZodType> {
  model: ModelId | (string & {}) // e.g. from an env override
  schema: T
  system?: string
  content: string | Anthropic.ContentBlockParam[]
  maxTokens?: number
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** For latency-bound calls (e.g. a question during a pause): fail fast, no retries. */
  timeoutMs?: number
}

/**
 * One request, validated JSON back. Throws on refusal, truncation or schema mismatch,
 * so callers can catch once and fall back to their last good state.
 */
export async function generateJson<T extends z.ZodType>(opts: JsonOptions<T>): Promise<z.infer<T>> {
  const response = await anthropic().messages.parse(
    {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 16000,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content: opts.content }],
      output_config: {
        // Haiku 4.5 does not take effort; the newer models do.
        ...(opts.effort && !opts.model.startsWith('claude-haiku') ? { effort: opts.effort } : {}),
        format: zodOutputFormat(opts.schema),
      },
    },
    opts.timeoutMs ? { timeout: opts.timeoutMs, maxRetries: 0 } : undefined,
  )

  if (response.stop_reason === 'refusal') {
    throw new Error(`Model refused: ${response.stop_details?.category ?? 'unknown'}`)
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Model output was cut off (max_tokens)')
  }
  if (response.parsed_output == null) {
    throw new Error('Model output did not match the schema')
  }
  return response.parsed_output as z.infer<T>
}
