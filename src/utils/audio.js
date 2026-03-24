const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WHISPER_SCRIPT = path.join(__dirname, 'whisper_transcribe.py');

// Transcribe audio using local Whisper — 100% free, no API key needed
async function transcribeAudio(audioBuffer, mimeType = 'audio/ogg') {
  const ext = mimeType.includes('ogg') ? 'ogg' :
               mimeType.includes('mp4') ? 'mp4' :
               mimeType.includes('webm') ? 'webm' :
               mimeType.includes('mpeg') ? 'mp3' : 'ogg';

  const tmpPath = path.join('/tmp', `audio_${Date.now()}.${ext}`);
  fs.writeFileSync(tmpPath, audioBuffer);

  try {
    const result = execSync(`python3 "${WHISPER_SCRIPT}" "${tmpPath}" es`, {
      timeout: 60000,
      encoding: 'utf8'
    });

    const parsed = JSON.parse(result.trim());
    if (parsed.error) throw new Error(parsed.error);
    return parsed.transcript;

  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

module.exports = { transcribeAudio };
