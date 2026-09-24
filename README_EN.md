# AI ManJu Workbench

> Read this in: [中文](README.md) | English

A **local-first** AI tool for creating animated comic dramas (motion-comic short dramas). It turns novel scripts/storyboards into finished videos through a full pipeline: **script → shot breakdown → image/video/voice generation → final composition**. The frontend is a single-page app; the backend is a lightweight Node service bound to `127.0.0.1` only — all data stays on your machine.

> This project is for learning and sharing. Bring your own OpenAI-compatible API key before use.

## Features

- **Script generation** — feed in plot text/outlines, call an LLM to produce shot-by-shot scripts.
- **Shot management** — structured storyboard cards (shot size, camera move, visual description, dialogue, mood, duration) with manual add/delete and confirm-to-save.
- **Asset management** — generate character/scene/prop reference images and `@mention` them for visual consistency.
- **Image / video generation** — call image & video models to produce key frames and clips per shot.
- **Voice-over & audio** — TTS for narration and character dialogue tracks.
- **Composition & export** — ffmpeg merges clips, audio and subtitles into a final MP4.

## Tech Stack

- **Backend**: plain Node.js `http` server (zero framework dependencies), `server.js`
- **Frontend**: single-file `index.html` (vanilla JS, no build step)
- **Local data**: JSON config + `projects/` directory for generated media
- **Toolchain**: `ffmpeg` (video), Python venv + edge-tts (voice-over)

## Directory Layout

```
ai-manju/
├── server.js                 # local server (127.0.0.1:8765; serves frontend + file/compose APIs)
├── index.html                # single-page frontend
├── start / stop .bat         # Windows one-click launch/stop scripts
├── modelConfig.example.json  # provider config template (key left blank — fill in your own)
├── LICENSE                   # MIT
└── README.md / README_EN.md
```

Generated at runtime and **excluded from git**: `modelConfig.json`, `settings.json`, `projects.json`, `projects/`, `server.pid`, `tools/`.

## Requirements

| Dependency | Purpose | Get it |
|---|---|---|
| **Node.js ≥ 18** | run the local server | https://nodejs.org |
| **ffmpeg** | video composition | place at `tools/ffmpeg.exe`, or install to system PATH |
| **Python + edge-tts** (optional) | voice-over | `pip install edge-tts` |

> `tools/` (ffmpeg binary, Python venv; ~80+ MB, Windows-specific) is **not included** in this repo. Provide your own ffmpeg as shown above.

## Quick Start

1. Install Node.js (≥ 18).
2. Clone the repo:
   ```bash
   git clone https://github.com/acdpy/ai-manju.git
   cd ai-manju
   ```
3. Put ffmpeg at `tools/ffmpeg.exe` (or on your PATH).
4. Launch: double-click `启动工作台.bat` on Windows, or:
   ```bash
   node server.js
   ```
5. Your browser opens `http://127.0.0.1:8765` automatically.
6. Go to **Settings → Model Providers**, add a provider and paste **your own API key** (any OpenAI-compatible text / image / video model service).
   - You can also copy `modelConfig.example.json` to `modelConfig.json` and fill in the `key` field.

## Security

- The server binds to `127.0.0.1` only; file APIs are sandboxed to the project directory.
- **Never commit `modelConfig.json` / `projects.json` containing real keys.** They are git-ignored by default.
- The example config ships with an empty `key`.

## License

[MIT](LICENSE) © 2026 acdpy
