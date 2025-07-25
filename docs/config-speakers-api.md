# Configure Speakers API Documentation

## Overview
This endpoint allows the frontend to replace generic speaker labels (Speaker 1, Speaker 2, etc.) with actual participant names in the raw transcript stored in Supabase. It also generates an AI summary using the updated transcript with real speaker names.

## Endpoint Details

### Configure Speaker Names
**Endpoint:** `POST /api/config_speakers`

**Base URL:** `https://live-transcript-service-backend.dev.singularity-works.com`

**Description:** Updates the raw transcript in the database by replacing generic speaker labels with the provided participant names and generates an AI summary with the updated speaker information.

### Request

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "id": "780bb9d9-3334-422d-81f1-145a8f68c3b3",
  "participants": [
    "Ron Llave",
    "Matthias Umpierrezz",
    "Emil Santos"
  ]
}
```

**Parameters:**
- `id` (required): The UUID of the record in the `meeting_bot_audio_transcript` table
- `participants` (required): Array of participant names in order (first name replaces "Speaker 1", second replaces "Speaker 2", etc.)

### Response

**Success Response (200 OK):**
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
      "brief": "The team discussed the Q4 product roadmap and agreed on three key initiatives for implementation.",
      "keyPoints": [
        "Feature X will be prioritized for December release",
        "Budget allocation needs review by finance team",
        "Customer feedback integration process established"
      ],
      "actionItems": [
        {
          "task": "Prepare detailed project timeline for Feature X",
          "assignee": "Ron Llave",
          "deadline": "2025-08-01"
        },
        {
          "task": "Schedule budget review meeting",
          "assignee": "Matthias Umpierrezz",
          "deadline": null
        }
      ]
    }
  }
}
```

**Error Responses:**

**400 Bad Request** - Missing or invalid parameters:
```json
{
  "success": false,
  "error": {
    "message": "Participants list is required and must be a non-empty array",
    "type": "ValidationError",
    "field": "participants"
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

## How It Works

1. **Speaker Mapping**: The endpoint creates a mapping where:
   - `participants[0]` → replaces "Speaker 1"
   - `participants[1]` → replaces "Speaker 2"
   - `participants[2]` → replaces "Speaker 3"
   - And so on...

2. **Updates Applied**:
   - All segments in the transcript have their speaker labels updated
   - The full text is updated to reflect the new speaker names
   - Original speaker labels are preserved in an `originalSpeaker` field
   - Metadata is updated to track the configuration
   - `is_speaker_configured` column is set to `true`
   - AI summary is generated with the updated speaker names
   - `transcript_ai_summary` column is populated with the generated summary

3. **Validation**:
   - The endpoint warns if the number of participants doesn't match the `speakers_identified_count`
   - However, it still processes the update with the provided names

## Implementation Example

### JavaScript/Frontend
```javascript
async function configureSpeakers(transcriptId, participantNames) {
  try {
    const response = await fetch('https://live-transcript-service-backend.dev.singularity-works.com/api/config_speakers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: transcriptId,
        participants: participantNames
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('Speakers configured:', result.result.speakerMapping);
    }
    
    return result;
  } catch (error) {
    console.error('Error configuring speakers:', error);
    throw error;
  }
}

// Example usage
configureSpeakers(
  '780bb9d9-3334-422d-81f1-145a8f68c3b3',
  ['Ron Llave', 'Matthias Umpierrezz', 'Emil Santos']
);
```

### cURL Example
```bash
curl -X POST https://live-transcript-service-backend.dev.singularity-works.com/api/config_speakers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "780bb9d9-3334-422d-81f1-145a8f68c3b3",
    "participants": ["Ron Llave", "Matthias Umpierrezz", "Emil Santos"]
  }'
```

## Database Updates

The endpoint updates the following columns in the `meeting_bot_audio_transcript` table:
- `raw_transcript`: Updated with new speaker names
- `is_speaker_configured`: Set to `true` when speakers are configured
- `transcript_ai_summary`: Populated with AI-generated meeting summary (JSONB format)

## Important Notes

1. **Order Matters**: The order of names in the `participants` array determines which speaker they replace
2. **Persistence**: Changes are saved to the database immediately
3. **Reversibility**: Original speaker labels are preserved in the `originalSpeaker` field
4. **Multiple Updates**: You can call this endpoint multiple times to update speaker names
5. **Configuration Flag**: The `is_speaker_configured` column helps track which transcripts have been configured
6. **AI Summary**: Summary generation uses Google Gemini API and may add 5-10 seconds to response time
7. **Graceful Failure**: If AI summary fails, speaker configuration still succeeds (check `aiSummaryGenerated` flag)
8. **Summary Structure**: The AI summary includes brief overview, key points, action items, topics, and insights

## Example Scenario

If your transcript has 3 identified speakers and segments like:
```
Speaker 1: "Hello everyone"
Speaker 2: "Good morning"
Speaker 3: "Let's begin"
Speaker 1: "Today's agenda..."
```

After calling with `participants: ["Ron Llave", "Matthias Umpierrezz", "Emil Santos"]`, it becomes:
```
Ron Llave: "Hello everyone"
Matthias Umpierrezz: "Good morning"
Emil Santos: "Let's begin"
Ron Llave: "Today's agenda..."
```

## AI Summary Structure

The `transcript_ai_summary` column contains a JSONB object with the following structure:

```json
{
  "summary": {
    "brief": "2-3 sentence executive summary",
    "keyPoints": ["Main discussion points"],
    "decisions": ["Decisions made"],
    "actionItems": [
      {
        "task": "Task description",
        "assignee": "Person responsible",
        "deadline": "ISO date or null"
      }
    ],
    "topics": ["Main topics discussed"],
    "sentiment": "positive/neutral/negative",
    "nextSteps": ["Planned next steps"]
  },
  "insights": {
    "participationRate": {
      "Ron Llave": "45%",
      "Matthias Umpierrezz": "30%",
      "Emil Santos": "25%"
    },
    "mostDiscussedTopics": ["Topic 1", "Topic 2", "Topic 3"],
    "meetingType": "standup/planning/review/discussion/other",
    "effectiveness": "high/medium/low with brief reason"
  },
  "metadata": {
    "generatedAt": "2025-07-25T10:30:00Z",
    "processingTime": 5234,
    "transcriptSegments": 45,
    "meetingDuration": 1800
  }
}
```