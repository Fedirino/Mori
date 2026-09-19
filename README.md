# Mori

Voice-first AI assistant — a public PWA that routes speech and text through a secure cloud relay to a private Hermes Agent backend.

> Formerly "Kyo". Renamed for easier voice/wake-word recognition.

## Architecture

```
Browser / PWA (kyo-os.web.app)
     |
     v
Firebase Function (auth + relay)
     |  Authenticates caller via Google sign-in
     |  Proxies requests through Cloudflare Zero Trust tunnel
     v
Hermes Agent (localhost:8642)
     |  OpenRouter-backed LLM reasoning
     |  ElevenLabs TTS via Hermes speech provider
     |  Local tools, cron, memory
```

The browser never holds an API key. Every request is authenticated by Firebase Auth, relayed through a Firebase Function, tunneled over Cloudflare, and delivered to Hermes running on a local machine. Provider keys live in Google Secret Manager, not client-side code.

## Features

- **Voice-first input** — speech-to-text via the Web Speech API, text via keyboard
- **Hermes-backed AI** — full reasoning, tool use, memory, and scheduled tasks via Hermes Agent
- **ElevenLabs TTS** — natural speech output, streamed through the secure relay
- **Google sign-in** — single-user auth, gated by a whitelist
- **Local fallback** — tasks, notes, and reminders work offline in browser storage
- **Rich markdown rendering** — rendered with marked.js

## Prerequisites

- A running **Hermes Agent** instance with the API server enabled at `localhost:8642`
- A **Cloudflare tunnel** exposing the Hermes API to the internet
- A **Firebase project** with Authentication (Google provider), Functions, and Hosting enabled
- **GitHub repository secrets**:
  - `HERMES_API_KEY` — key for authenticating to Hermes
  - `HERMES_API_URL` — the Cloudflare tunnel URL pointing to Hermes
  - `ELEVENLABS_API_KEY` — ElevenLabs API key for TTS
  - `WINSTON_ALLOWED_EMAIL` — the Google email authorized to use the app

## Deployment

Push to the `main` branch. The GitHub Actions workflow:

1. Copies secrets to Google Secret Manager
2. Deploys the Firebase Function with secret access
3. Deploys Hosting assets to Firebase Hosting

If secrets are missing, Hosting deploys safely with a local-key fallback path.

## Development

Serve locally as a static site:

```bash
npx serve .
```

Run core behavior tests:

```bash
npm test
```

## Why this matters

This is a production-ready pattern for running a private AI assistant behind a public web UI. No cloud LLM proxy service, no vendor lock-in, no client-side API keys. The AI runs on your hardware. The frontend could be anything — this architecture separates the surface (PWA, web app, SMS, Telegram) from the brain (Hermes Agent).