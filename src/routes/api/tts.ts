import { createFileRoute } from '@tanstack/react-router';
import { HELPY_VOICE } from '../../shared/helpyVoice';

// POST /api/tts  { text, voiceId? }  ->  audio/mpeg
// For anything spoken OUTSIDE the agent (Capture questions and replies, Teach guidance). Same voice, model and
// settings as the ElevenLabs agents (src/shared/helpyVoice.json), so Helpy sounds the same in every mode.
export const Route = createFileRoute('/api/tts')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text, voiceId } = (await request.json()) as { text?: string; voiceId?: string };
        const apiKey = process.env.ELEVENLABS_API_KEY;
        const voice = voiceId ?? process.env.ELEVENLABS_TTS_VOICE_ID ?? HELPY_VOICE.voiceId;

        if (!text?.trim()) return Response.json({ error: 'text required' }, { status: 400 });
        if (!apiKey) return Response.json({ error: 'ELEVENLABS_API_KEY missing' }, { status: 500 });

        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
          {
            method: 'POST',
            headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
            body: JSON.stringify({
              text,
              model_id: process.env.ELEVENLABS_TTS_MODEL ?? HELPY_VOICE.model,
              voice_settings: HELPY_VOICE.settings,
            }),
          },
        );
        if (!res.ok || !res.body) {
          return Response.json({ error: `ElevenLabs ${res.status}`, detail: await res.text() }, { status: 502 });
        }
        return new Response(res.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
      },
    },
  },
});
