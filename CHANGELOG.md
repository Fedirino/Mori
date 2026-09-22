# Changelog
## [0.9.5] - 2026-09-22

### Added
- Added a LoomRP-style PWA auto-updater: Mori now checks for service-worker updates on launch, periodically while open, and when the app returns to the foreground; when a new worker activates, it shows a toast and reloads cleanly.

### Changed
- Bumped frontend version, manifest start URL, and service-worker cache key to `0.9.5` so installed PWAs pick up this updater release.

## [0.9.4] - 2026-09-19

### Changed
- Renamed the app from Winston to **Mori** — the assistant's chosen name (Latin for "messenger," Welsh for "sea", a nod to the Hermes harness). Updated everywhere user-facing: title, wordmark, aria-labels, status text, persona name, greeting, version tag, hands-free wake word ("hey Mori", covering common mishearings like Morey/Mory/Maury), manifest, README, and the Tauri desktop identifier (`com.mori.desktop`). GitHub repo renamed to `Fedirino/Mori`.
- Default ElevenLabs voice switched to **George** (`JBFqnCBsd6RMkjVDRZzb`) as Mori's voice; the settings override still lets you pick any voice.

## [0.9.1] - 2026-08-20

### Fixed
- Speech recognition no longer duplicates word fragments when browser sends partial final results (e.g. "hello hello winston" → "hello winston")
- Voice transcript now properly rebuilt from all finalized results instead of appending



## 0.8.2
- Added `goT3UYdM9bhm0n2lmKQx` as Winston's built-in ElevenLabs voice while retaining the Settings override.

## 0.8.1
- Added an authenticated Firebase Functions proxy for OpenRouter chat and ElevenLabs speech, keeping provider keys out of the browser.
- Added Google sign-in with an exact allowed-email check, origin validation, request limits, model allowlisting, and bounded payloads.
- Added a GitHub Actions secret-to-Firebase deployment path with a safe hosting-only fallback until all runtime secrets are configured.
- Kept legacy browser-local keys temporarily available so the existing app continues working during migration.

## 0.8.0
- Added Winston's first useful persistent core: natural-language capture for tasks, notes, and reminders, stored locally across launches.
- Added Today and Inbox views with counts, completion, reopening, editing, deletion, and undo.
- Added saved-item confirmation cards with immediate Edit and Undo actions.
- Added local recall and action commands such as "What do I need to do today?", "Show my PDP reminders", and "Mark the strawberry review complete."
- Core capture and recall work without an OpenRouter key; general AI chat continues to use the existing OpenRouter setting.
- Fixed broad weather routing so ordinary questions containing "today" or "week" no longer become weather requests.
- Fixed live forecast context using Today's forecast as Tomorrow, and tightened travel preset routing to explicit commands.
- Moved the new capture model and parser into a tested ES module and added Node's built-in test runner.

## 0.7.4
- Reverted the experimental mode chips and mode-routing UI; Winston is back to a fast plain chat shell.
- Kept the continuous mic conversation flow so the mic can reopen after replies for cleaner back-and-forth.
- Bumped shell/version markers so installed PWAs pick up the rollback cleanly.

## 0.7.3
- Phase 3 slice: added context mode chips (General, Voice, Weather, Travel, Brain), mode-aware status/help, typed/spoken mode routing, and a clickable modebar.
- Bumped version/cache markers so installed PWAs pick up the new shell on launch.

## 0.7.2
- Fixed settings sheet on installed mobile PWA: tapping the gear (or the wordmark) threw a TypeError because the "Continuous Mic Conversation" select was added to the sheet but never registered on the `els` element map, so `openSettings()` / `saveSettings()` crashed on `els.continuous.value` and the sheet never opened or saved. Registered `els.continuous` and settings works again on installed home-screen apps.
- Service worker switched to network-first for the app shell (index.html, manifest.json, service-worker.js and navigation requests) with cache fallback for offline. Installed PWAs now pick up fixes on the next launch instead of being pinned to whatever cached version they were installed with.
- Version and cache bumped to 0.7.2 so the new service worker actually activates and cleans out the old cache.

## 0.7.1
- New homescreen icon set: "Molten Core," an organic ember-particle burst built from the same randomized spike-angle/length/twinkle math as the live app core (not hand-drawn spokes), with a real bloom/glow pass baked in. Replaces the old two-chevron mark left over from before the Ember Core redesign.
- Regenerated at every size the app uses: favicon, apple-touch-icon, 64/180/192/512, plus a refreshed icon.svg source.
- Service worker cache and manifest version bumped so installed PWAs actually pick up the new icon instead of showing the old cached one.

## 0.7.0
- Renamed the app from Kyo to Winston (easier to say and for speech recognition to catch, which is what prompted it). Updated everywhere user-facing: title, wordmark, aria-labels, status text, persona name, greeting, hands-free wake word ("hey Winston" — with common mishearings like Weston/Winsten/Whinston covered), manifest, README.
- Saved settings (API key, model, voice, etc.) are untouched — the underlying storage keys were intentionally left as-is, so nothing resets from the rename.
- Brand wordmark box widened and resized to fit "Winston" cleanly at both mobile and desktop sizes.

## 0.6.1
- Fixed a silent failure: if a browser doesn't support continuous speech recognition at all (Firefox has none, Safari's is limited), turning on hands-free used to just do nothing with zero feedback. It now shows a toast telling you it's not supported there and turns the setting back off, instead of looking broken.
- Broadened wake-word matching — "Kyo" is an unusual word and speech engines often mishear it (Cairo, Kyoto, Kayo, etc.); those variants now trigger it too, and matching now checks interim results as well as final ones so it reacts faster.
- Added a calibration aid: while hands-free is on and idle, any recognized phrase that doesn't match the wake word shows briefly as a toast ("heard: ...") so you can see exactly what the mic picked up and adjust how you say it.
- Ambient recognition now restarts faster after a browser-forced stop (150ms vs 250ms) to shrink the gap where speech could be missed.

## 0.6.0
- Added hands-free wake-word mode (Settings → Hands-Free Wake Word). When on, Kyo listens ambiently in the background for "hey Kyo" (or just "Kyo") and either acts immediately if a command followed in the same breath, or opens the mic for what comes next.
- Ambient listening pauses automatically while Kyo is listening for a manual tap, thinking, or speaking — so it can't hear itself and loop. Whisper text under the mic reflects hands-free status when idle.
- Best-effort by nature: browser support for continuous recognition varies, so it auto-restarts itself in the background; if mic permission is denied it turns itself back off with a toast.
- Version and service worker cache bumped to 0.6.0.

## 0.5.1
- Added a desktop/large-viewport breakpoint (≥820px wide, ≥640px tall): wider shell, bigger brand mark, core, mic, and text, scrollable body instead of clipped. Same single file, no separate app — the mobile layout is untouched below that size.

## 0.5.0
- Ember Core now drifts subtly with the real local time of day: warm bright orange near 2pm, cooling toward a deeper, dimmer ember-red around 2am, smoothly in between. Idle state also breathes gently instead of holding a static spike.
- Kyo now gets a live system note before every message with the real current date/time, and — with location permission — current local weather pulled from Open-Meteo (free, no API key), refreshed every 15 minutes. Keeps answers about "what time is it" / "what's it like out" grounded in reality instead of guessed.
- Persona now addresses the user as Fedirino or Sir (never Nick) and is written to feel like it already has rapport — established assistant, not a fresh introduction.
- Conversation history is still session-only for now (not persisted across reloads) — holding off on that by request.

## 0.4.1
- Killed the default mobile blue tap-highlight on buttons/links; added a proper focus-visible ring for keyboard/accessibility use instead.
- Mic button now clearly shows "on": filled amber background + brighter border while listening, plus an expanding pulse ring, on top of the existing corona and icon glow.
- Map action now opens the real Google Maps app first (`comgooglemaps://`) and only falls back to the Maps website if the app doesn't actually open (desktop, or app not installed).

## 0.4.0
- Kyo can now actually do things: open a website, run a web search, or pull up a map/directions, triggered straight from the conversation.
- The model signals an action with a trailing tag it never speaks aloud (`[ACTION:OPEN_URL|...]`, `[ACTION:SEARCH|...]`, `[ACTION:MAP|...]`); Kyo strips it before displaying/speaking and opens the real destination (Google Search / Google Maps / direct URL) in a new tab.
- Added a small amber HUD toast ("opening map — ...") that confirms what just launched, matching the Ember Core look.
- Version and service worker cache bumped to 0.4.0.

## 0.3.1
- Mic button redesign: replaced the glossy gradient sphere with a dense ember-particle corona (kin to the hero core's spike engine) behind the mic glyph. Flares brighter/faster while listening.
- Design exploration for this pass archived under mockups/ (mic-options.html through mic-options-v6.html).
- Version and service worker cache bumped to 0.3.1.

## 0.3.0
- Full visual redesign: EMBER MINIMAL. Living particle-burst core (canvas) replaces the orb — flares when listening, contracts and swirls when thinking, pulses while speaking.
- New warm ember palette (orange on graphite) replacing neon green; glossy mic button; hairline-only UI.
- Kyo wordmark rebuilt: fully legible gradient base with periodic glitch bursts.
- New persona: calm, precise "warm machine" assistant (replaces AI-scared hillbilly).
- Conversation shown as floating lines with a time-aware greeting; status reads "Kyo is listening/thinking/speaking".
- Design exploration archive added under mockups/.
- Manifest and service worker cache bumped for clean rollout.

## 0.2.3
- Pushed Kyo into a much more drastic AI-scared hillbilly comedy persona.
- Tuned the voice to feel jumpy, suspicious of automation, and funny without losing usefulness.
- Updated the greeting and visible version/cache so the new shell is obvious after refresh.

## 0.2.2
- Switched Kyo into Hillbilly Skeptic personality mode.
- Added user context to the system prompt so Kyo knows Nick works in management in retail produce and prefers concise, direct help.
- Tuned the default tone to be folksy, skeptical, and useful without becoming cartoonish.

## 0.2.1
- Added proper home-screen icons and Apple touch icon assets.
- Updated manifest and service worker cache to avoid stale installed PWA shells.
- Bumped app shell version for cleaner refresh links.

## 0.2.0
- Added OpenRouter chat integration.
- Added Settings drawer for API key + model selection.
- Added Web Speech voice input and TTS voice output.
- Avatar reacts to listening / thinking / speaking states.
- Default model set to a cheap OpenRouter option.

## 0.1.0
- Initial Kyo scaffold.
