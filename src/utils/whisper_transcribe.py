#!/usr/bin/env python3
# Local Whisper transcription — 100% free, no API key needed
import sys
import whisper
import json

def transcribe(audio_path, language='es'):
    model = whisper.load_model("base")  # small model, fast
    result = model.transcribe(audio_path, language=language)
    return result["text"].strip()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio path provided"}))
        sys.exit(1)

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else 'es'

    try:
        text = transcribe(audio_path, language)
        print(json.dumps({"transcript": text}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
