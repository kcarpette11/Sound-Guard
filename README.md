# SoundGaurd 🛡️

Real-time environmental sound alerts for people who are Deaf or hard of hearing.

SoundGaurd listens through the microphone (or your device's own audio) and turns
safety-relevant sounds into large, unmissable visual alerts with vibration.

## The five sounds

| Sound | Alert | Severity |
| --- | --- | --- |
| 🚨 Smoke / fire alarm | Fire / Smoke Alarm | Critical |
| 🚑 Siren | Emergency Vehicle Nearby | High |
| 👶 Baby crying | Baby Crying | Medium |
| 🚗 Car horn | Car Horn Nearby | Medium |
| 🚪 Door knock | Someone Is at the Door | Normal |

## Two AI layers

SoundGaurd deliberately splits detection from interpretation:

```
🎤 microphone / 💻 device audio
        │
        ▼
  Web Audio API  ──────────►  onset detector  ──►  knocks (instant, <100ms)
        │
        ▼
  AudioSet classifier (Transformers.js, in a Web Worker)
        │
        ▼
  Alert engine  ──►  🚨 VISUAL ALERT + VIBRATION   (immediate, never blocked)
        │
        ▼
  /api/gemini  ──►  Google Gemini  ──►  ✨ verification + plain-language context
```

**Layer 1 — speed.** A pretrained AudioSet model runs entirely in the browser
via Transformers.js, inside a Web Worker so inference never blocks the audio
callbacks or the UI. Knocks take a separate path: they are percussive
transients too short to reliably win a classification window, so a classic
onset detector catches them in well under 100ms.

**Layer 2 — understanding.** Once a sound is confirmed, Gemini adds a
structured second opinion and an accessible one-line explanation. It runs
server-side and **never gates the alert** — the warning is already on screen
before Gemini is called. If Gemini is slow, rate-limited, or unavailable, the
safety alert is completely unaffected.

## Detection design notes

A few decisions that matter more than they look:

- **Categories are compared as a set, not walked in rank order.** AudioSet
  emits weak percussive labels ("Tap", "Thump") underneath a crying baby.
  Picking the first eligible label meant a background label could fire while
  the true dominant sound was mid-cooldown — announcing a door knock during a
  baby's cry. The engine now scores every category and takes the strongest,
  suppressing candidates that a louder sound clearly dominates.
- **Scores are smoothed across windows.** A single noisy frame cannot flip the
  displayed sound.
- **The knock fast path requires a quiet run-up.** A knock is
  quiet → loud → quiet. Gaps inside continuous loud audio are not knocks, so
  crying and sirens no longer masquerade as knocking.
- **Long analysis window, short hop.** The classifier always analyzes a
  fixed-size input regardless of clip length, so a short window just pads real
  audio with silence and weakens confidence. SoundGaurd analyzes a 6s window but
  re-checks every 0.5s — better accuracy at no latency cost.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then add your key
npm run dev
```

Set `GEMINI_API_KEY` in `.env.local`:

```
GEMINI_API_KEY=your_key_here
```

The key is read only on the server inside the route handler and is never
exposed to the browser. `.env.local` is gitignored.

Open http://localhost:3000 and press the microphone button.

> **Note on Gemini quota.** The free tier allows a limited number of requests
> per day. SoundGaurd caches verifications per sound category for two minutes to
> avoid burning quota on repeat detections, and reports quota exhaustion
> distinctly so it is never confused with a failed detection.

## Device audio mode

Toggle **Device audio** to analyze sound playing on the computer instead of the
room — useful for testing with a video, or for captioning media you are
watching. The browser will ask you to pick a source; you must tick
**"Share tab audio"** / **"Share system audio"** in that dialog, since browsers
provide no way to capture device audio silently. Best supported in Chrome and
Edge.

## Tech stack

| Part | Technology |
| --- | --- |
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Audio | MediaDevices + Web Audio API |
| Sound AI | Transformers.js + AudioSet (AST) |
| Generative AI | Google Gemini via `@google/genai` |
| Backend | Next.js Route Handler |
| Deployment | Vercel |

## Project layout

```
app/
  page.tsx              orchestration: audio → detection → alerts
  api/gemini/route.ts   server-side Gemini call (holds the API key)
components/             UI
lib/
  audio/                mic + device capture, framing, level, onset detection
  ml/                   classifier (worker-backed) and label → category mapping
  alerts/               scoring, smoothing, thresholds, cooldowns
  gemini/               prompt + response schema
```

## Accessibility

Alerts are full-screen and color-coded by severity so they are visible from
across a room, paired with `navigator.vibrate()` where supported. The live
input meter and "Now hearing" panel give continuous confirmation that the app
is actually listening, rather than leaving the user guessing between alerts.
