# Offline natural English audio

Audio is generated locally with Kokoro-82M and converted to MP3. There is no
cloud TTS API, API key, subscription, or per-character fee. The generated files
are stored as `audio/<sentence-id>.mp3` and are played by the iPhone app.

The default voice is American English `af_heart`, at 0.9x speed.

```powershell
# Generate one preview sentence
npm.cmd run generate-audio -- --limit=1

# Generate one unit
npm.cmd run generate-audio -- --unit=1

# Generate all missing audio
npm.cmd run generate-audio

# Optional: split generation across four terminal processes
npm.cmd run generate-audio -- --shard=1/4
```

Existing MP3 files are skipped. Use `--force` to regenerate them. Other voices
can be selected with `--voice=af_bella`, `--voice=am_michael`, or another voice
supported by Kokoro.
