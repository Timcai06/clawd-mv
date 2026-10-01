# clawd-mv

A code-rendered music video for **Works on My Machine**, by **Tim 蔡任天**.
Clawd, the orange pixel mascot of Claude Code, fixes an off-by-one bug: October has 32 days.
The story runs through an editor, a calendar city, failing tests, a pull request and one more commit.

This is a personal, non-commercial project, developed with Claude and Codex.
The video is rendered with TypeScript and three.js; scene motion, lyrics and cursor sparks
are computed from song time. The current edit has 18 scenes, 80 shots and a duration of 160.6 seconds.
The project is still being iterated; source availability does not mark a final video release.

Built on [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video).
The original MIT copyright notice is preserved in [LICENSE](LICENSE), and the upstream revision
is recorded in [reference/pdoom/UPSTREAM_COMMIT](reference/pdoom/UPSTREAM_COMMIT).
Its scene code and documentation are kept in `reference/pdoom/` for reference.

## Requirements

- [Bun](https://bun.sh/) for dependencies, development and scripts.
- Google Chrome for the offline renderer, driven headlessly through Playwright.
- FFmpeg with libx264 for video export.
- macOS with PingFang SC to reproduce the Chinese author card with its intended font.

The committed timing data is sufficient for rendering. Python and
[uv](https://docs.astral.sh/uv/) are only needed to regenerate the audio analysis.

## Preview

```sh
git clone https://github.com/Timcai06/clawd-mv.git
cd clawd-mv/app
bun install
bunx vite
```

Open <http://localhost:5173>. Add `?t=23` to start at a particular song time.

The final song master is local-only and is **not included** in this repository.
Place your local copy at `audio/song.wav` before previewing or exporting with the song.
The bundled `audio/song.mp3` is a placeholder beat track; it does not reproduce the final soundtrack.

| Key | Action |
| --- | --- |
| Space | Play / pause |
| Left / right | Seek 1 second; Shift seeks 5 seconds |
| `,` / `.` | Step one frame |
| `[` / `]` | Previous / next timeline shot |
| `l` | Loop the current timeline shot |
| `h` | Hide the player UI |

## Render

Run from `app/`:

```sh
# 1080p, 60 fps, adaptive motion blur, H.264 CRF 16 and AAC audio
bun scripts/render.ts video --from 0 --to 160.6 --samples auto --preset medium --crf 16 --out ../out/preview/clawd-mv.mp4

# Full-resolution stills
bun scripts/render.ts stills --t 1.5,12,45.5,103.4,123.6 --out ../out/stills

# Measure all 9636 frames, including GPU synchronization and pixel readback
bun scripts/render.ts perf --from 0 --to 160.6
```

For a true 3840×2160 render, add `--scale 2`. This increases rendering and encoding costs.
Other options include `--from` / `--to` for a segment and `--noaudio` for a silent export.
See [docs/ENGINE.md](docs/ENGINE.md) for adaptive sampling and the scene API.
Rendered outputs stay in the ignored `out/` directory.

## Layout

| Path | Contents |
| --- | --- |
| `app/src/engine/` | Timeline playback, typography, GPU line batches and post-processing |
| `app/src/kit/` | Shared Clawd, cursor, sparks, lyric, lens and handoff components |
| `app/src/scenes/` | Scene modules; supporting geometry and state in `parts/` |
| `app/scripts/render.ts` | Offline Chrome → raw frames → FFmpeg exporter |
| `storyboard/shots.json` | Shot timing and lyric anchors used by the timeline |
| `data/audio.json` | Measured variable-tempo beat grid, onsets and audio features |
| `data/lyrics.json` | Word-level lyric alignment |
| `analysis/` | Audio analysis and alignment tools |
| `lyrics/` | Song lyrics and source timing material |
| `reference/` | Upstream renderer examples and canonical Clawd reference |
| `docs/` | Treatment, storyboard, architecture, task specifications and project history |

## Checks

```sh
cd app
bunx tsc
bun test tests
bun scripts/storyboard-check.ts
```

The Whisper comparison tests also need the local fixture
`analysis/work/c1/whisper_turbo_quick.json`, which is not committed.
The remaining source and timing tests do not require the song master.

## Credits and license

- Film, lyrics and song prompt: Tim 蔡任天.
- Music: generated with Suno, **Works on My Machine**.
- Scene design and implementation: developed with Claude; scoped engineering and verification with Codex.
- Renderer foundation: [Giacomo Magnanini / mexicat/pdoom-video](https://github.com/mexicat/pdoom-video), MIT.
- Clawd: the Claude Code mascot by Anthropic; this is an unofficial personal project.
- Fonts: Archivo, IBM Plex Mono and Cormorant Garamond; font license material is included in `app/public/fonts/src/OFL.txt`.

The code uses the [MIT License](LICENSE). The song, lyrics, mascot and font assets are not
relicensed by the code license. The reference song from pdoom-video is not included.

For production details, see [TREATMENT](docs/TREATMENT.md), [ENGINE](docs/ENGINE.md),
[ARCHITECTURE](docs/ARCHITECTURE.md) and [STORYBOARD](docs/STORYBOARD.md).
