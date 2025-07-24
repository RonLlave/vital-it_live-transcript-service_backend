# Meeting Bot Raw Save API Documentation

## Overview
This document describes the new API endpoint for the Meeting Bot team to save raw transcripts to Supabase after audio files have been uploaded to public storage.

## Endpoint Details

### Save Raw Transcript
**Endpoint:** `POST /api/transcribe/raw_save`

**Base URL:** `https://live-transcript-service-backend.dev.singularity-works.com`

**Description:** Transcribes audio from a public URL and saves the raw transcript to the `meeting_bot_audio_transcript` table in Supabase.

### Request

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "id": "780bb9d9-3334-422d-81f1-145a8f68c3b3",
  "publicUrl": "https://supabasekong-os0gcs8scwgk8ogg4owg4sww.dev.singularity-works.com/storage/v1/object/public/bot-audio-transcript/google_meet_iuf-egac-zwm_2025-07-24_08-45-12.mp3"
}
```

**Parameters:**
- `id` (required): The UUID of the record in the `meeting_bot_audio_transcript` table
- `publicUrl` (required): The public URL of the audio file to transcribe

### Response

**Success Response (200 OK):**
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

**Error Responses:**

**400 Bad Request** - Missing required parameters:
```json
{
  "success": false,
  "error": {
    "message": "ID is required",
    "type": "ValidationError",
    "field": "id"
  }
}
```

**404 Not Found** - Record not found:
```json
{
  "success": false,
  "error": {
    "message": "No record found with the provided ID",
    "type": "ValidationError",
    "field": "id"
  }
}
```

**500 Internal Server Error** - Processing error:
```json
{
  "success": false,
  "error": {
    "message": "Failed to save transcript: [error details]",
    "type": "ExternalAPIError",
    "service": "Supabase"
  }
}
```

## Implementation Example

### Node.js with Axios
```javascript
const axios = require('axios');

async function saveRawTranscript(id, publicUrl) {
  try {
    const response = await axios.post(
      'https://live-transcript-service-backend.dev.singularity-works.com/api/transcribe/raw_save',
      {
        id: id,
        publicUrl: publicUrl
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 300000 // 5 minutes timeout for large files
      }
    );

    console.log('Transcript saved:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error saving transcript:', error.response?.data || error.message);
    throw error;
  }
}

// Example usage
saveRawTranscript(
  '780bb9d9-3334-422d-81f1-145a8f68c3b3',
  'https://supabasekong-os0gcs8scwgk8ogg4owg4sww.dev.singularity-works.com/storage/v1/object/public/bot-audio-transcript/google_meet_iuf-egac-zwm_2025-07-24_08-45-12.mp3'
);
```

### cURL Example
```bash
curl -X POST https://live-transcript-service-backend.dev.singularity-works.com/api/transcribe/raw_save \
  -H "Content-Type: application/json" \
  -d '{
    "id": "780bb9d9-3334-422d-81f1-145a8f68c3b3",
    "publicUrl": "https://supabasekong-os0gcs8scwgk8ogg4owg4sww.dev.singularity-works.com/storage/v1/object/public/bot-audio-transcript/google_meet_iuf-egac-zwm_2025-07-24_08-45-12.mp3"
  }'
```

## Database Schema

The endpoint updates the following columns in the `meeting_bot_audio_transcript` table:

- `raw_transcript` (JSONB): Contains the full transcript data including:
  - `segments`: Array of transcript segments with speaker labels
  - `fullText`: Complete transcript as plain text
  - `wordCount`: Total word count
  - `duration`: Audio duration in seconds
  - `detectedLanguage`: Detected language code
  - `metadata`: Additional metadata
- `speakers_identified_count` (integer): Number of unique speakers identified in the audio
- `transcribed_at` (timestamp): When the transcription was completed
- `status` (text): Set to 'completed' on success or 'failed' on error
- `error_message` (text): Error details if transcription fails
- `is_speaker_configured` (boolean): Remains `false` after initial transcription (set to `true` when `/api/config_speakers` is called)

## Speaker Identification

The transcript uses generic speaker labels:
- "Speaker 1" for the first identified speaker
- "Speaker 2" for the second identified speaker
- And so on...

The Google Gemini API intelligently identifies different speakers based on voice characteristics and maintains consistency throughout the transcript.

## Important Notes

1. **Audio File Requirements:**
   - Must be publicly accessible via the provided URL
   - Maximum file size: 500MB
   - Supported formats: MP3, WAV, M4A, and other common audio formats

2. **Processing Time:**
   - Transcription time depends on audio duration
   - Typical processing: 10-30 seconds per minute of audio
   - Request timeout: 5 minutes

3. **Error Handling:**
   - If transcription fails, the record's `status` is updated to 'failed'
   - Error details are stored in the `error_message` column
   - The API returns appropriate error responses for debugging

4. **Idempotency:**
   - Multiple calls with the same ID will overwrite previous transcripts
   - Consider implementing checks on your end if needed

## Support

For issues or questions about this API endpoint:
- Check the service health: `GET https://live-transcript-service-backend.dev.singularity-works.com/health`
- Review logs for detailed error information
- Contact the Live Transcript Service team