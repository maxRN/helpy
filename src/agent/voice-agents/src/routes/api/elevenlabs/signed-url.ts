import { createFileRoute } from '@tanstack/react-router';

// GET /api/elevenlabs/signed-url?agent=interviewer|tutor  ->  { signedUrl }
export const Route = createFileRoute('/api/elevenlabs/signed-url')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const agent = new URL(request.url).searchParams.get('agent') ?? 'interviewer';
        const agentId =
          agent === 'tutor' ? process.env.ELEVENLABS_AGENT_TUTOR : process.env.ELEVENLABS_AGENT_INTERVIEWER;
        const apiKey = process.env.ELEVENLABS_API_KEY;

        if (!apiKey || !agentId) {
          return Response.json({ error: 'ELEVENLABS_API_KEY or agent id not configured' }, { status: 500 });
        }

        const res = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
          { headers: { 'xi-api-key': apiKey } },
        );
        if (!res.ok) {
          return Response.json({ error: `ElevenLabs ${res.status}`, detail: await res.text() }, { status: 502 });
        }
        const body = (await res.json()) as { signed_url: string };
        return Response.json({ signedUrl: body.signed_url }, { headers: { 'Cache-Control': 'no-store' } });
      },
    },
  },
});
