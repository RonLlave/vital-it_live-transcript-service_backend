# Frontend Transcribe API Documentation

## Overview
These endpoints allow the frontend to directly request transcription of audio by providing the audio URL and participant list. This gives the frontend full control over when and how transcription happens.

## Base URL
```
https://live-transcript-service-backend.dev.singularity-works.com
```

## Speaker Identification Behavior

The endpoints handle speaker identification differently:

- **`/api/transcribe`** - Uses participant names to identify speakers (e.g., "John Doe", "Jane Smith")
- **`/api/transcribe/raw`** - Uses generic labels with intelligent detection (e.g., "Speaker 1", "Speaker 2")
- **`/api/transcribe/summary`** - Uses participant names internally for better context in the summary

## Endpoints

> **Note:** For Meeting Bot team integration, see the [`/api/transcribe/raw_save`](meeting-bot-raw-save-api.md) endpoint documentation.
> 
> **Note:** To configure speaker names after transcription, see the [`/api/config_speakers`](config-speakers-api.md) endpoint documentation.

### 1. Transcribe Audio (Raw + AI Summary)
**Endpoint:** `POST /api/transcribe`

**Description:** Transcribes audio and returns both raw transcript and AI summary in a single response.

**Request Body:**
```json
{
  "audioUrl": "https://meeting-bot-backend.dev.singularity-works.com/api/google-meet-guest/audio-blob/guest_bot_123",
  "participants": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "role": "participant"
    },
    {
      "name": "Jane Smith",
      "email": "jane@example.com", 
      "role": "participant"
    }
  ],
  "eventId": "google_meet_event_123",
  "meetingUrl": "https://meet.google.com/abc-defg-hij",
  "botId": "bot_1" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "eventId": "google_meet_event_123",
  "transcription": {
    "segments": [
      {
        "id": "segment_1",
        "speaker": "John Doe",
        "text": "Hello everyone, let's start the meeting.",
        "timestamp": "00:00:05",
        "startTimestamp": "00:00:05",
        "endTimestamp": "00:00:08",
        "startTime": 5.0,
        "endTime": 8.5,
        "confidence": 0.95
      }
    ],
    "fullText": "Hello everyone, let's start the meeting...",
    "wordCount": 250,
    "duration": 180.5,
    "detectedLanguage": "en",
    "languageConfidence": 0.98,
    "metadata": {
      "totalSegments": 15,
      "languages": ["en"],
      "lastUpdated": "2025-07-24T10:00:00.000Z"
    }
  },
  "aiSummary": {
    "summary": "## Meeting Summary\n\nThe team discussed the Q3 project timeline...",
    "keyPoints": [
      "Project deadline moved to August 15",
      "Budget approved for additional resources"
    ],
    "actionItems": [
      {
        "task": "Submit design mockups",
        "assignee": "John Doe",
        "dueDate": "2025-07-30"
      }
    ],
    "metadata": {
      "generatedAt": "2025-07-24T10:00:00.000Z",
      "model": "gemini-1.5-flash"
    }
  },
  "participants": [...]
}
```

### 2. Raw Transcript Only
**Endpoint:** `POST /api/transcribe/raw`

**Description:** Returns only the raw transcript without AI summary (faster response). Uses generic speaker labels (Speaker 1, Speaker 2, etc.) with intelligent speaker detection.

**Audio Format:** Expects WAV format from Meeting Bot API audioblob URLs.

**Request Body:**
```json
{
  "audioUrl": "https://meeting-bot-backend.dev.singularity-works.com/api/google-meet-guest/audio-blob/guest_bot_123",
  "participants": [...],  // Still accepted but not used for speaker names
  "eventId": "google_meet_event_123",
  "meetingUrl": "https://meet.google.com/abc-defg-hij"
}
```

**Response:**
```json
{
  "success": true,
  "eventId": "google_meet_event_123",
  "transcription": {
    "segments": [
      {
        "id": "segment_1",
        "speaker": "Speaker 1",
        "text": "Hello everyone, let's start the meeting.",
        "timestamp": "00:00:05",
        "startTimestamp": "00:00:05",
        "endTimestamp": "00:00:08",
        "startTime": 5.0,
        "endTime": 8.5,
        "confidence": 0.95
      },
      {
        "id": "segment_2",
        "speaker": "Speaker 2",
        "text": "Thanks for joining today.",
        "timestamp": "00:00:09",
        "startTimestamp": "00:00:09",
        "endTimestamp": "00:00:11",
        "startTime": 9.0,
        "endTime": 11.2,
        "confidence": 0.93
      }
    ],
    "fullText": "Speaker 1: Hello everyone, let's start the meeting. Speaker 2: Thanks for joining today...",
    "wordCount": 250,
    "duration": 180.5,
    "detectedLanguage": "en",
    "languageConfidence": 0.98,
    "metadata": {
      "totalSegments": 45,
      "languages": ["en"],
      "lastUpdated": "2025-07-24T10:00:00.000Z"
    }
  }
}
```

### 3. AI Summary Only
**Endpoint:** `POST /api/transcribe/summary`

**Description:** Transcribes audio and generates only the AI summary (without returning raw transcript).

**Request Body:**
```json
{
  "audioUrl": "https://meeting-bot-backend.dev.singularity-works.com/api/google-meet-guest/audio-blob/guest_bot_123",
  "participants": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "role": "participant"
    },
    {
      "name": "Jane Smith",
      "email": "jane@example.com",
      "role": "participant"
    }
  ],
  "eventId": "google_meet_event_123",
  "meetingUrl": "https://meet.google.com/abc-defg-hij",
  "meetingTitle": "Q3 Planning Meeting", // Optional
  "botId": "bot_1" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "eventId": "google_meet_event_123",
  "aiSummary": {
    "summary": {
      "brief": "A 2-3 sentence executive summary of the meeting",
      "keyPoints": ["Key discussion point 1", "Key discussion point 2"],
      "decisions": ["Decision made during the meeting"],
      "actionItems": [
        {
          "task": "Action item description",
          "assignee": "Person responsible",
          "deadline": null
        }
      ],
      "topics": ["Topic 1", "Topic 2"],
      "sentiment": "positive",
      "nextSteps": ["Next step 1", "Next step 2"]
    },
    "keyPoints": ["Key point 1", "Key point 2"],
    "actionItems": [...],
    "decisions": ["Decision 1"],
    "topics": ["Topic 1", "Topic 2"],
    "sentiment": "positive",
    "nextSteps": ["Next step 1"],
    "insights": {
      "participationRate": {
        "Ron Cymond Llave": "45%",
        "Avril Ley Ann Llave": "55%"
      },
      "mostDiscussedTopics": ["Testing", "Error handling"],
      "meetingType": "discussion",
      "effectiveness": "medium - Some technical issues discussed"
    },
    "metadata": {
      "generatedAt": "2025-07-24T10:00:00.000Z",
      "model": "gemini-1.5-flash",
      "segmentCount": 15,
      "duration": 72,
      "wordCount": 145
    }
  }
}
```

## Implementation Example

```javascript
// Frontend implementation for periodic transcription
class TranscriptionService {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.pollingInterval = null;
  }

  // Start polling for transcriptions
  async startTranscriptionPolling(audioUrl, participants, eventId, interval = 30000) {
    // Initial transcription
    await this.transcribe(audioUrl, participants, eventId);
    
    // Set up periodic updates
    this.pollingInterval = setInterval(async () => {
      await this.transcribe(audioUrl, participants, eventId);
    }, interval);
  }

  // Stop polling
  stopTranscriptionPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  // Transcribe audio
  async transcribe(audioUrl, participants, eventId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audioUrl,
          participants,
          eventId,
          meetingUrl: window.location.href
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Update UI with transcript
        this.updateTranscriptUI(data.transcription);
        this.updateSummaryUI(data.aiSummary);
      }
      
      return data;
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }

  // Get only raw transcript (faster)
  async getRawTranscript(audioUrl, participants, eventId) {
    const response = await fetch(`${this.baseUrl}/api/transcribe/raw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audioUrl,
        participants,
        eventId
      })
    });

    return response.json();
  }

  // Get only AI summary
  async getAISummary(audioUrl, participants, eventId, meetingTitle) {
    const response = await fetch(`${this.baseUrl}/api/transcribe/summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audioUrl,
        participants,
        eventId,
        meetingTitle: meetingTitle || 'Meeting',
        meetingUrl: window.location.href
      })
    });

    return response.json();
  }

  // Update UI methods
  updateTranscriptUI(transcription) {
    // Update your transcript display
    console.log('New transcript segments:', transcription.segments.length);
  }

  updateSummaryUI(aiSummary) {
    // Update your summary display
    console.log('AI Summary updated');
  }
}

// Usage
const transcriptionService = new TranscriptionService(
  'https://live-transcript-service-backend.dev.singularity-works.com'
);

// Start polling every 30 seconds
transcriptionService.startTranscriptionPolling(
  'https://meeting-bot-backend.dev.singularity-works.com/api/google-meet-guest/audio-blob/guest_bot_123',
  [
    { name: 'John Doe', email: 'john@example.com' },
    { name: 'Jane Smith', email: 'jane@example.com' }
  ],
  'google_meet_event_123',
  30000 // 30 seconds
);

// Stop when meeting ends
transcriptionService.stopTranscriptionPolling();
```

## Error Handling

All endpoints return error responses in this format:
```json
{
  "success": false,
  "error": {
    "message": "Audio URL is required",
    "type": "ValidationError",
    "field": "audioUrl"
  },
  "timestamp": "2025-07-24T10:00:00.000Z"
}
```

## Rate Limiting
- 100 requests per minute per IP
- Consider caching responses to reduce API calls

## Notes
1. **Audio URL**: Must be publicly accessible or include authentication in the URL
2. **Participants**: Helps improve speaker identification accuracy
3. **Polling**: Recommended interval is 30-60 seconds to balance real-time updates with API usage
4. **Audio Size**: Maximum 200MB per request
5. **Timeout**: Requests timeout after 30 seconds