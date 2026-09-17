const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

initializeApp();

const openRouterKey = defineSecret('OPENROUTER_API_KEY');
const hermesApiKey = defineSecret('HERMES_API_KEY');
const hermesApiUrl = defineSecret('HERMES_API_URL');
const elevenLabsKey = defineSecret('ELEVENLABS_API_KEY');
const allowedEmail = defineSecret('WINSTON_ALLOWED_EMAIL');

const ALLOWED_ORIGINS = new Set([
  'https://kyo-os.web.app',
  'https://kyo-os.firebaseapp.com'
]);

const ALLOWED_MODELS = new Set([
  'xiaomi/mimo-v2.5',
  'google/gemini-2.5-flash-lite',
  'openai/gpt-5.4-nano',
  'qwen/qwen3.5-flash-02-23',
  'deepseek/deepseek-chat',
  'deepseek/deepseek-reasoner',
  'openrouter/auto'
]);

const requestWindows = new Map();

function json(res, status, body) {
  res.status(status).set('Cache-Control', 'no-store').json(body);
}

function rateLimit(uid) {
  const now = Date.now();
  const cutoff = now - 60_000;
  const recent = (requestWindows.get(uid) || []).filter((time) => time > cutoff);
  if (recent.length >= 30) return false;
  recent.push(now);
  requestWindows.set(uid, recent);
  return true;
}

async function authenticate(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    const expected = allowedEmail.value().trim().toLowerCase();
    const actual = String(decoded.email || '').trim().toLowerCase();
    if (!expected || !decoded.email_verified || actual !== expected) return null;
    return decoded;
  } catch (error) {
    return null;
  }
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return null;
  const cleaned = messages.slice(-32).map((message) => ({
    role: ['system', 'user', 'assistant'].includes(message && message.role) ? message.role : '',
    content: typeof (message && message.content) === 'string' ? message.content.slice(0, 12_000) : ''
  })).filter((message) => message.role && message.content);
  const total = cleaned.reduce((sum, message) => sum + message.content.length, 0);
  return cleaned.length && total <= 60_000 ? cleaned : null;
}

async function handleChat(req, res, sessionKey) {
  const messages = cleanMessages(req.body && req.body.messages);
  if (!messages) return json(res, 400, { error: 'Invalid messages.' });

  const hermesUrl = (hermesApiUrl.value() || '').replace(/\/+$/, '');
  const hermesKey = hermesApiKey.value();
  if (!hermesUrl || !hermesKey) {
    return json(res, 503, { error: 'Hermes relay is not configured.' });
  }

  // Convert messages to a plain input string for the runs API.
  // Format as a conversation transcript so Hermes has full context.
  const input = messages
    .map(m => (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content)
    .join('\n');

  const runHeaders = sessionKey
    ? { Authorization: 'Bearer ' + hermesKey, 'Content-Type': 'application/json', 'X-Hermes-Session-Key': sessionKey }
    : { Authorization: 'Bearer ' + hermesKey, 'Content-Type': 'application/json' };

  // Step 1: Create a run
    const createResp = await fetch(hermesUrl + '/v1/runs', {
      method: 'POST',
      headers: runHeaders,
      body: JSON.stringify({
        model: 'kyo',
        input: input.slice(0, 60_000),
        session_id: sessionKey ? ('winston-conv-' + sessionKey.replace(/[^A-Za-z0-9_-]/g, '')) : undefined,
        max_tokens: Math.min(1000, Math.max(80, Number(req.body.max_tokens) || 220)),
        temperature: Math.min(1, Math.max(0, Number(req.body.temperature) || 0.6))
      })
    });
  if (!createResp.ok) {
    const detail = (await createResp.text().catch(() => '')).slice(0, 180);
    console.error('Hermes runs create error', createResp.status, detail);
    return json(res, 502, { error: 'The Hermes relay is unavailable.' });
  }
  const run = await createResp.json();
  const runId = run.run_id;
  if (!runId) return json(res, 502, { error: 'Hermes relay did not return a run ID.' });

  // Step 2: Poll events until completed or timeout
  const deadline = Date.now() + 110_000;
  let fullOutput = '';
  const toolCalls = [];
  let done = false;

  while (Date.now() < deadline && !done) {
    await new Promise(r => setTimeout(r, 600));
    try {
      const eventsResp = await fetch(hermesUrl + '/v1/runs/' + runId + '/events', {
              headers: sessionKey
                ? { Authorization: 'Bearer ' + hermesKey, 'X-Hermes-Session-Key': sessionKey }
                : { Authorization: 'Bearer ' + hermesKey }
            });
      if (!eventsResp.ok) {
        // 404 means the event log is gone — fetch the run status directly
        if (eventsResp.status === 404) {
          const statusResp = await fetch(hermesUrl + '/v1/runs/' + runId, {
            headers: { Authorization: 'Bearer ' + hermesKey }
          });
          if (statusResp.ok) {
            const status = await statusResp.json();
            fullOutput = status.output || fullOutput;
          }
          done = true;
        }
        break;
      }
      const raw = await eventsResp.text();
      // Parse SSE-style data: lines
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;
        try {
          const event = JSON.parse(payload);
          if (event.event === 'run.completed') {
            fullOutput = event.output || fullOutput;
            done = true;
          } else if (event.event === 'message.delta') {
            fullOutput += event.delta || '';
          } else if (event.event === 'reasoning.available') {
            // Reasoning text — can use as-is or append
          } else if (event.event === 'tool.started') {
            toolCalls.push({
              tool: event.tool || 'tool',
              arguments: event.preview || '',
              status: 'running',
              latency: null
            });
          } else if (event.event === 'tool.completed') {
            // Update the last matching tool
            const lastRunning = toolCalls.filter(t => t.status === 'running').length;
            if (lastRunning > 0) {
              for (let i = toolCalls.length - 1; i >= 0; i--) {
                if (toolCalls[i].status === 'running') {
                  toolCalls[i].status = event.error ? 'error' : 'success';
                  toolCalls[i].latency = event.duration ? Math.round(event.duration * 1000) : null;
                  break;
                }
              }
            }
          }
        } catch (e) {
          // Skip malformed events
        }
      }
    } catch (e) {
      console.error('Hermes events poll error', e.message);
      break;
    }
  }

  let trimmed = fullOutput || '';
  if (fullOutput && fullOutput.length > 120) {
    trimmed = compressVoiceReply(fullOutput);
  }

  return json(res, 200, {
    reply: trimmed || fullOutput || '…',
    tool_calls: toolCalls
  });
}

function compressVoiceReply(text) {
  // Strip markdown code blocks (full tool output, JSON, etc.)
  text = text.replace(/```[\s\S]*?```/g, '').trim();
  // Strip inline code snippets
  text = text.replace(/`[^`]+`/g, '').trim();
  // Strip action tags like [ACTION:OPEN_URL|...]
  text = text.replace(/\[ACTION:[^\]]+\]/g, '').trim();
  // Strip markdown links: [text](url) → text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  // Strip bare URLs
  text = text.replace(/https?:\/\/[^\s,.!?)]+/g, '').trim();
  // Strip markdown formatting: **bold**, *italic*, ~~strikethrough~~
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1').trim();
  text = text.replace(/\*([^*]+)\*/g, '$1').trim();
  text = text.replace(/~~([^~]+)~~/g, '$1').trim();
  // Remove emoji characters
  text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '').trim();
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // Strip markdown list markers and convert to natural phrasing
  text = text.replace(/^\s*[-*+]\s+/gm, '').trim();
  text = text.replace(/^\s*\d+[.)]\s+/gm, '').trim();
  text = text.replace(/\n{2,}/g, ' ').trim();

  // Split into sentences (handles . ! ? and common abbreviations)
  const sentences = text.match(/[^.!?\n]+[.!?]+(\s|$)/g) || [text];
  const clean = sentences.map(s => s.trim()).filter(Boolean);

  if (clean.length <= 2) return clean.join(' ');

  // Take first 2 sentences. If the first is very short (acknowledgement), include the third.
  let keep = clean.slice(0, 2);
  if (clean[0].length < 30 && clean.length >= 3) {
    keep = clean.slice(0, 3);
  }

  return keep.join(' ').trim();
}

async function handleSpeech(req, res) {
  const text = String((req.body && req.body.text) || '').trim();
  const voiceId = String((req.body && req.body.voiceId) || '').trim();
  if (!text || text.length > 2500) return json(res, 400, { error: 'Invalid speech text.' });
  if (!/^[A-Za-z0-9_-]{5,80}$/.test(voiceId)) return json(res, 400, { error: 'Invalid voice ID.' });

  const upstream = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId), {
    method: 'POST',
    headers: {
      'xi-api-key': elevenLabsKey.value(),
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true }
    })
  });
  if (!upstream.ok) {
    console.error('ElevenLabs error', upstream.status, (await upstream.text().catch(() => '')).slice(0, 180));
    return json(res, 502, { error: 'The speech provider is unavailable.' });
  }
  const audio = Buffer.from(await upstream.arrayBuffer());
  res.status(200)
    .set('Cache-Control', 'no-store')
    .set('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg')
    .send(audio);
}

async function handleTranscribe(req, res) {
  const audio = String((req.body && req.body.audio) || '').trim();
  const mime = String((req.body && req.body.mime) || 'audio/webm').trim();
  if (!audio || audio.length > 5_000_000) return json(res, 400, { error: 'Invalid audio.' });

  const upstream = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + openRouterKey.value(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/whisper-large-v3',
      audio: 'data:' + mime + ';base64,' + audio,
      response_format: 'json'
    })
  });
  if (!upstream.ok) {
    const detail = (await upstream.text().catch(() => '')).slice(0, 180);
    console.error('Transcription error', upstream.status, detail);
    return json(res, 502, { error: 'Transcription failed.' });
  }
  const data = await upstream.json();
  const text = String((data && data.text) || '').trim();
  if (!text) return json(res, 502, { error: 'Transcription returned empty.' });
  return json(res, 200, { text });
}

exports.api = onRequest({
  region: 'us-central1',
  timeoutSeconds: 120,
  memory: '256MiB',
  maxInstances: 3,
  secrets: [openRouterKey, hermesApiKey, hermesApiUrl, elevenLabsKey, allowedEmail]
}, async (req, res) => {
  const origin = req.get('origin');
  res.set('Vary', 'Origin');
  res.set('X-Content-Type-Options', 'nosniff');
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: 'Origin not allowed.' });

  const path = String(req.path || req.url || '').split('?')[0].replace(/\/+$/, '');
  if (req.method === 'GET' && path.endsWith('/health')) {
    return json(res, 200, { ready: true, authentication: 'google' });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const contentLength = Number(req.get('content-length') || 0);
  const parsedLength = req.body ? JSON.stringify(req.body).length : 0;
  if (contentLength > 100_000 || parsedLength > 100_000) {
    return json(res, 413, { error: 'Request is too large.' });
  }

  const user = await authenticate(req);
  if (!user) return json(res, 401, { error: 'Sign in with the authorized Google account.' });
  if (!rateLimit(user.uid)) return json(res, 429, { error: 'Too many requests. Try again shortly.' });

  try {
    if (path.endsWith('/chat')) return await handleChat(req, res, 'winston:' + user.uid);
    if (path.endsWith('/tts')) return await handleSpeech(req, res);
    if (path.endsWith('/transcribe')) return await handleTranscribe(req, res);
    return json(res, 404, { error: 'Unknown endpoint.' });
  } catch (error) {
    console.error('Winston API error', error);
    return json(res, 500, { error: 'Winston could not complete that request.' });
  }
});
