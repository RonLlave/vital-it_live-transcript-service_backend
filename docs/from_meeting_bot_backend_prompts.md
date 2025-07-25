# To Live Transcript Backend Team - API Integration Details

## Overview

We are using your API endpoint to request audio-to-text transcription after we save audio recordings to our Supabase storage. This document explains exactly how we're calling your API and what we expect it to do.

## API Endpoint We're Using

```
POST https://live-transcript-service-backend.dev.singularity-works.com/api/transcribe/raw_save
```

## Request Details

### Headers

```json
{
  "Content-Type": "application/json"
}
```

### Request Body Structure

```json
{
  "id": "6361d189-4df0-4751-9532-c507e094227b",
  "publicUrl": "https://aawbvgnmtwzftalhnerk.supabase.co/storage/v1/object/public/bot-audio-transcript/google_meet_xxx-xxxx-xxx_2025-07-25_02-30-45.mp3"
}
```

### Field Explanations

1. **`id`** (UUID string)

   - This is the primary key ID from our `meeting_bot_audio_transcript` table
   - You should use this ID to find the record in the database
   - Example: `"6361d189-4df0-4751-9532-c507e094227b"`

2. **`publicUrl`** (string)
   - This is the publicly accessible URL of the MP3 audio file stored in Supabase
   - The file is already uploaded and accessible via this URL
   - Format: MP3, 96kbps, 16kHz, Mono
   - Example: `"https://aawbvgnmtwzftalhnerk.supabase.co/storage/v1/object/public/bot-audio-transcript/google_meet_xxx-xxxx-xxx_2025-07-25_02-30-45.mp3"`

## What We Need Your API To Do

1. **Receive our POST request** with the `id` and `publicUrl`

2. **Find the database record**:

   ```sql
   SELECT * FROM meeting_bot_audio_transcript WHERE id = '{id}';
   ```

3. **Download the audio file** from the `publicUrl`

4. **Process the audio** using Google Gemini API to generate transcript

5. **Update the database record** with the transcript:

   ```sql
   UPDATE meeting_bot_audio_transcript
   SET
     raw_transcript = '{generated_transcript_text}',
     speakers_identified_count = {number_of_speakers},
     status = 'completed'
   WHERE id = '{id}';
   ```

6. **Return success response** to us:
   ```json
   {
     "success": true,
     "id": "6361d189-4df0-4751-9532-c507e094227b",
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

## Error Handling

If something goes wrong, please return an error response:

```json
{
  "success": false,
  "error": "Detailed error message here",
  "message": "Human-readable error description"
}
```

And update the database with the error:

```sql
UPDATE meeting_bot_audio_transcript
SET
  status = 'failed',
  error_message = '{error_details}'
WHERE id = '{id}';
```

## Current Issue

We're getting an error response that's being logged as `[object Object]`. Please ensure your error responses are properly formatted JSON with string error messages, not nested objects.

## Example Call From Our Side

```javascript
const response = await fetch(
  "https://live-transcript-service-backend.dev.singularity-works.com/api/transcribe/raw_save",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: "6361d189-4df0-4751-9532-c507e094227b",
      publicUrl:
        "https://aawbvgnmtwzftalhnerk.supabase.co/storage/v1/object/public/bot-audio-transcript/google_meet_xxx-xxxx-xxx_2025-07-25_02-30-45.mp3",
    }),
  }
);
```

## Important Notes

1. The `id` is a UUID that already exists in the `meeting_bot_audio_transcript` table
2. The audio file is already uploaded and publicly accessible at the `publicUrl`
3. We expect you to update the `raw_transcript` column with the transcribed text
4. The transcript should use "Speaker 1", "Speaker 2" format for different speakers
5. Please handle errors gracefully and return clear error messages

## Database Schema Reference

Table: `meeting_bot_audio_transcript`

- `id` (UUID) - Primary key
- `bot_id` (VARCHAR)
- `bot_name` (VARCHAR)
- `meeting_link` (TEXT)
- `audio_filename` (VARCHAR)
- `metadata` (JSONB)
- `raw_transcript` (TEXT) - **This is what you need to update**
- `speakers_identified_count` (INTEGER) - **Also update this**
- `status` (VARCHAR) - Set to 'completed' or 'failed'
- `error_message` (TEXT) - Set if transcription fails
- `created_at` (TIMESTAMPTZ)

## Contact

If you have any questions about this integration, please reach out to the Meeting Bot team.
