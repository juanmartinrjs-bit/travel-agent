const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Transcribe an audio file using Groq Whisper (free, fast, no extra cost)
async function transcribeAudio(audioBuffer, mimeType = 'audio/ogg') {
  // Save buffer to temp file
  const ext = mimeType.includes('ogg') ? 'ogg' :
               mimeType.includes('mp4') ? 'mp4' :
               mimeType.includes('webm') ? 'webm' : 'ogg';

  const tmpPath = path.join('/tmp', `audio_${Date.now()}.${ext}`);
  fs.writeFileSync(tmpPath, audioBuffer);

  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: 'whisper-large-v3-turbo', // Fast + accurate, free on Groq
      language: 'es', // Spanish by default, auto-detects others
      response_format: 'text'
    });

    return transcription;
  } finally {
    // Clean up temp file
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

module.exports = { transcribeAudio };
