#!/usr/bin/env python3
# Local Whisper transcription — 100% free, no API key needed
import sys
import os
import whisper
import json

# Point to ffmpeg-static binary bundled with npm
FFMPEG_PATH = os.path.abspath(os.path.join(
    os.path.dirname(__file__),
    '../../node_modules/ffmpeg-static/ffmpeg'
))
if os.path.exists(FFMPEG_PATH):
    ffmpeg_dir = os.path.dirname(FFMPEG_PATH)
    os.environ['PATH'] = ffmpeg_dir + ':' + os.environ.get('PATH', '')

def transcribe(audio_path, language='es'):
    model = whisper.load_model("base")
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
