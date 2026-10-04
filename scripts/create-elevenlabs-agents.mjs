// Creates Helpy's two ElevenLabs agents (interviewer, tutor) and their client tools in the account of
// ELEVENLABS_API_KEY, then checks each agent by requesting a signed URL, like the app does.
//
//   node scripts/create-elevenlabs-agents.mjs          create, or update the agents whose ids are in .env
//   node scripts/create-elevenlabs-agents.mjs --new    always create new agents
//
// Prompts come from src/agent/prompts/. Tool names and parameters must match src/agent/tools.ts.
// Prints the agent ids for ELEVENLABS_AGENT_INTERVIEWER / ELEVENLABS_AGENT_TUTOR (.env and Railway).
import { readFileSync } from 'node:fs'

try {
  process.loadEnvFile('.env')
} catch {
  // no .env: rely on the environment
}

const KEY = process.env.ELEVENLABS_API_KEY
if (!KEY) {
  console.error('ELEVENLABS_API_KEY is missing (.env or environment).')
  process.exit(1)
}

const API = 'https://api.elevenlabs.io/v1'
const VOICE = process.env.ELEVENLABS_TTS_VOICE_ID || 'SAz9YHcvj6GT2YYXdXww' // River: relaxed, neutral, calm
const LLM = process.env.ELEVENLABS_AGENT_LLM || 'claude-sonnet-5-5'
const TTS_MODEL = 'eleven_flash_v2' // ElevenLabs requires turbo/flash v2 for English agents; lowest latency

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`)
  return data
}

const clientTool = (name, description, properties = {}, required = []) => ({
  tool_config: {
    type: 'client',
    name,
    description,
    parameters: { type: 'object', properties, required },
    expects_response: true,
    response_timeout_secs: 10,
  },
})

// Must match src/agent/tools.ts
const TOOLS = {
  set_off_record: clientTool(
    'set_off_record',
    'Call when the expert says "off the record" / "stop recording" (on = true) or "back on the record" (on = false).',
    { on: { type: 'boolean', description: 'true = stop recording and transcribing, false = continue' } },
    ['on'],
  ),
  confirm_teachback: clientTool(
    'confirm_teachback',
    'Call after asking "Is that how it works?" following a [TEACHBACK]: confirmed = true if the expert agrees, otherwise false with their correction in their own words.',
    {
      confirmed: { type: 'boolean', description: 'true if the expert agrees with the explanation' },
      correction: { type: 'string', description: "The expert's correction in their own words; empty if confirmed" },
    },
    ['confirmed'],
  ),
  get_next_step: clientTool(
    'get_next_step',
    'Call when the trainee asks "what now?" or is stuck. Returns JSON with stepId, targetId and the step in Sabine\'s words, or {"done": true}. Wait for the result before speaking.',
  ),
  point_to: clientTool(
    'point_to',
    'Make Helpy point at a screen element. Use the targetId returned by get_next_step (e.g. field-costCenter, field-assetNumber, action-hold, action-request_approval, action-post, row-5102).',
    { targetId: { type: 'string', description: 'Screen element id, e.g. field-costCenter' } },
    ['targetId'],
  ),
  show_expert_clip: clientTool(
    'show_expert_clip',
    "Replay Sabine's screen moment for a step while you explain it. Use the stepId from the [INTERVENE] message.",
    { stepId: { type: 'string', description: 'Work Map step id, e.g. S3' } },
    ['stepId'],
  ),
}

const skipTurn = {
  skip_turn: {
    type: 'system',
    name: 'skip_turn',
    description: 'Stay silent this turn while the person is narrating, thinking aloud, typing or reading.',
    params: { system_tool_type: 'skip_turn' },
  },
}

function agentBody(name, prompt, toolIds, dynamicVariables) {
  return {
    name,
    tags: ['sabine-ai', 'hack-nation'],
    conversation_config: {
      agent: {
        first_message: '', // Helpy stays silent until there is something to say
        language: 'en',
        prompt: { prompt, llm: LLM, tool_ids: toolIds, built_in_tools: skipTurn },
        ...(dynamicVariables ? { dynamic_variables: { dynamic_variable_placeholders: dynamicVariables } } : {}),
      },
      tts: { voice_id: VOICE, model_id: TTS_MODEL },
      turn: { turn_eagerness: 'patient', turn_timeout: 30 },
      conversation: {
        max_duration_seconds: 1800,
        // voice.ts needs: transcripts (onMessage), speaking mode (audio), interruptions, VAD score (pause detection)
        client_events: ['audio', 'interruption', 'user_transcript', 'agent_response', 'vad_score', 'agent_tool_response'],
      },
    },
  }
}

const prompt = (file) => readFileSync(new URL(`../src/agent/prompts/${file}`, import.meta.url), 'utf8')

console.log(`Voice ${VOICE}, LLM ${LLM}, TTS ${TTS_MODEL}`)

// Reuse tools from an earlier run (same name), so re-running does not create duplicates.
const existing = await call('GET', '/convai/tools')
const byName = new Map((existing.tools ?? []).map((t) => [t.tool_config?.name, t.id]))

const ids = {}
for (const [name, body] of Object.entries(TOOLS)) {
  if (byName.has(name)) {
    ids[name] = byName.get(name)
    console.log(`tool ${name}: ${ids[name]} (existing)`)
    continue
  }
  const tool = await call('POST', '/convai/tools', body)
  ids[name] = tool.id
  console.log(`tool ${name}: ${tool.id}`)
}

// Existing agents (ids in .env) are updated in place, so the ids in Railway stay valid. --new forces new agents.
const forceNew = process.argv.includes('--new')
async function upsert(role, envId, body) {
  if (envId && !forceNew) {
    await call('PATCH', `/convai/agents/${envId}`, body)
    console.log(`agent ${role}: ${envId} (updated)`)
    return { agent_id: envId }
  }
  const created = await call('POST', '/convai/agents/create', body)
  console.log(`agent ${role}: ${created.agent_id} (created)`)
  return created
}

const interviewer = await upsert(
  'interviewer',
  process.env.ELEVENLABS_AGENT_INTERVIEWER,
  agentBody('Helpy – Interviewer (Sabine AI)', prompt('interviewer.md'), [ids.set_off_record, ids.confirm_teachback]),
)

const tutor = await upsert(
  'tutor',
  process.env.ELEVENLABS_AGENT_TUTOR,
  agentBody('Helpy – Tutor (Sabine AI)', prompt('tutor.md'), [ids.get_next_step, ids.point_to, ids.show_expert_clip], {
    work_map: '(No Work Map loaded yet.)',
  }),
)

// Same check as /api/elevenlabs/signed-url
for (const [role, id] of [['interviewer', interviewer.agent_id], ['tutor', tutor.agent_id]]) {
  const signed = await call('GET', `/convai/conversation/get-signed-url?agent_id=${id}`)
  console.log(`signed url ${role}: ${signed.signed_url ? 'ok' : 'MISSING'}`)
}

console.log('\nPut these into .env and Railway → Variables:')
console.log(`ELEVENLABS_AGENT_INTERVIEWER=${interviewer.agent_id}`)
console.log(`ELEVENLABS_AGENT_TUTOR=${tutor.agent_id}`)
