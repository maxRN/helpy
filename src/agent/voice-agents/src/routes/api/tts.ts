import { createFileRoute } from '@tanstack/react-router';

// POST /api/tts  { text, voiceId? }  ->  audio/mpeg
// For anything spoken OUTSIDE the agent (clip narration, debrief fallback, etc).
export const Route = createFileRoute('/api/tts')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text, voiceId } = (await request.json()) as { text?: string; voiceId?: string };
        const apiKey = process.env.ELEVENLABS_API_KEY;
        const voice = voiceId ?? process.env.ELEVENLABS_TTS_VOICE_ID;

        if (!text?.trim()) return Response.json({ error: 'text required' }, { status: 400 });
        if (!apiKey || !voice) {
          return Response.json({ error: 'ELEVENLABS_API_KEY or ELEVENLABS_TTS_VOICE_ID missing' }, { status: 500 });
        }

        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
          {
            method: 'POST',
            headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
            body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_TTS_MODEL ?? 'eleven_flash_v2_5' }),
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
