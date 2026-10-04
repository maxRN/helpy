// Helpy's voice settings, shared by the TTS route and (as JSON) by scripts/create-elevenlabs-agents.mjs.
import voice from './helpyVoice.json'

export const HELPY_VOICE = voice as { voiceId: string; model: string; settings: { stability: number; similarity_boost: number; speed: number } }
