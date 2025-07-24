# Meeting Bot Team - Raw Transcript Save API

## Quick Start Guide

We've created a new API endpoint for you to save raw transcripts after uploading audio files to Supabase storage.

### Endpoint
```
POST https://live-transcript-service-backend.dev.singularity-works.com/api/transcribe/raw_save
```

### Request Body
```json
{
  "id": "your-record-uuid",
  "publicUrl": "your-public-audio-url"
}
```

### Example Request
```javascript
// After you've uploaded the audio file to Supabase storage and have the public URL:
const response = await fetch('https://live-transcript-service-backend.dev.singularity-works.com/api/transcribe/raw_save', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id: '780bb9d9-3334-422d-81f1-145a8f68c3b3',
    publicUrl: 'https://supabasekong-os0gcs8scwgk8ogg4owg4sww.dev.singularity-works.com/storage/v1/object/public/bot-audio-transcript/google_meet_iuf-egac-zwm_2025-07-24_08-45-12.mp3'
  })
});

const result = await response.json();
```

### What It Does
1. Fetches the audio from your public URL
2. Transcribes it using Google Gemini API
3. Saves the transcript to the `raw_transcript` column in your `meeting_bot_audio_transcript` table
4. Saves the number of unique speakers to the `speakers_identified_count` column
5. Updates the record status to 'completed' or 'failed'

### Speaker Format
- Uses "Speaker 1", "Speaker 2", etc. (not participant names)
- Gemini intelligently identifies different speakers by voice

### Response
Success:
```json
{
  "success": true,
  "id": "780bb9d9-3334-422d-81f1-145a8f68c3b3",
  "message": "Transcript saved successfully",
  "transcript": {
    "segmentCount": 45,
    "wordCount": 523,
    "duration": 180.5,
    "detectedLanguage": "en",
    "speakersIdentifiedCount": 2
  }
}
```

### Notes
- Make sure the audio URL is publicly accessible
- The process typically takes 10-30 seconds per minute of audio
- Maximum audio file size: 500MB
- On error, check the `error_message` column in your table for details

That's it! The transcript will be saved directly to your Supabase table.