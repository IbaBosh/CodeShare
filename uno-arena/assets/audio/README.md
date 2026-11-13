# Audio assets

The six files in this folder are the local audio files referenced by the game server. The server exposes them at `/assets/audio/` directly from this folder.

| File | Purpose | Local source |
|---|---|---|
| `ambience.mp3` | 40 s looping background music | Original procedural synthesizer fallback |
| `card-click.mp3` | Card selection / click | Procedural UI sound fallback |
| `card-play.mp3` | Card placement | Procedural UI sound fallback |
| `victory.mp3` | Match victory | Procedural synth jingle fallback |
| `defeat.mp3` | Match defeat | Procedural synth cue fallback |
| `uno-callout.mp3` | Spoken “Uno !” announcement | Local French eSpeak TTS fallback |

## ElevenLabs generation record

Two original ElevenLabs generations completed successfully and remain available in the linked Creative Studio flows:

- Instrumental game ambience, 45 seconds (`eleven_music_v2`).
- Card placement SFX, 2 seconds (`eleven_text_to_sound_v2`).

The signed media URLs could not be fetched into the build environment, and the remaining requests were declined because shared free-generation capacity was busy. Therefore, the local MP3 files included here are original procedural substitutes, not copies of the two successful ElevenLabs renders. The game uses these local files. The original generation record is documented in `STEP1-AUDIO-REPORT.md`.

The source generator is `generate_audio_assets.py`. It uses Python, NumPy, SciPy, FFmpeg, and eSpeak; it contains no sampled or third-party music.
