# Frontend Team - Configure Speakers API

## Quick Guide

After a transcript has been saved with generic speaker labels (Speaker 1, Speaker 2, etc.), you can update it with real participant names. The API will also generate an AI summary using the updated speaker names.

### Endpoint
```
POST https://live-transcript-service-backend.dev.singularity-works.com/api/config_speakers
```

### Request
```javascript
const response = await fetch('https://live-transcript-service-backend.dev.singularity-works.com/api/config_speakers', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id: '780bb9d9-3334-422d-81f1-145a8f68c3b3',  // Row ID from meeting_bot_audio_transcript table
    participants: [
      'Ron Llave',         // Will replace "Speaker 1"
      'Matthias Umpierrezz', // Will replace "Speaker 2"
      'Emil Santos'        // Will replace "Speaker 3"
    ]
  })
});
```

### How It Works
- The order of names in the `participants` array matters
- First name replaces "Speaker 1", second replaces "Speaker 2", etc.
- Updates are saved to the database immediately
- All transcript segments and full text are updated

### Response
```json
{
  "success": true,
  "id": "780bb9d9-3334-422d-81f1-145a8f68c3b3",
  "message": "Speaker names configured and AI summary generated successfully",
  "result": {
    "updatedSegments": 45,
    "totalSegments": 45,
    "speakerMapping": {
      "Speaker 1": "Ron Llave",
      "Speaker 2": "Matthias Umpierrezz",
      "Speaker 3": "Emil Santos"
    },
    "aiSummaryGenerated": true,
    "summary": {
      "brief": "The team discussed the Q4 product roadmap and agreed on three key initiatives...",
      "keyPoints": [
        "Feature X will be prioritized for December release",
        "Budget allocation needs review by finance team",
        "Customer feedback integration process established"
      ],
      "actionItems": [
        {
          "task": "Prepare detailed project timeline",
          "assignee": "Ron Llave",
          "deadline": "2025-08-01"
        }
      ]
    }
  }
}
```

### Usage Flow
1. Get the transcript ID and speaker count from the database
2. Collect participant names from your UI (in the order they should map to speakers)
3. Call this endpoint with the ID and participant array
4. The transcript in the database will be updated with real names

### What Gets Updated
- The `raw_transcript` column with new speaker names
- The `is_speaker_configured` column is set to `true`
- The `transcript_ai_summary` column with AI-generated meeting summary (if successful)

### Notes
- Make sure the number of participants matches the `speakers_identified_count` for best results
- You can call this endpoint multiple times if names need to be corrected
- Original speaker labels are preserved in the database for reference
- The `is_speaker_configured` flag helps you track which transcripts have been configured
- AI summary generation may add 5-10 seconds to the response time
- If AI summary generation fails, the speaker configuration still succeeds
- The `aiSummaryGenerated` flag indicates whether summary was created successfully