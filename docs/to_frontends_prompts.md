# Frontend Integration Update - Live Transcript Service

## Important Update (July 23, 2025)

The Live Transcript Service backend has been updated with fixes and improvements. This document provides the latest integration guidelines for frontend developers.

## API Endpoints

The service supports **two equivalent endpoint patterns** for fetching transcript data:

1. **Original**: `/api/enhanced-transcripts/:sessionId`
2. **Alias (NEW)**: `/api/live-transcript/:sessionId`  **Use this one**

Both endpoints return identical data. The `/api/live-transcript` alias was added for better naming clarity.

## Session ID Format

The session ID follows the pattern: `{botId}_transcript`

Example: For bot `bot_1`, the session ID is `bot_1_transcript`

## Complete API URL

```
https://live-transcript-service-backend.dev.singularity-works.com/api/live-transcript/{sessionId}
```

Example:
```
https://live-transcript-service-backend.dev.singularity-works.com/api/live-transcript/bot_1_transcript
```

## Expected Behavior

### 1. Session Creation
- Sessions are created **immediately** when a bot joins a meeting
- You will NOT get 404 errors anymore
- Initial response will have empty transcript but populated metadata

### 2. Audio Processing Timeline
- **0-10 seconds**: Session exists, transcript empty, metadata available
- **10-30 seconds**: Audio starts processing (depends on when speaker starts talking)
- **30+ seconds**: Transcript segments begin appearing
- **60+ seconds**: AI summary becomes available

### 3. Response Structure

```json
{
  "success": true,
  "sessionId": "bot_1_transcript",
  "event_id": "meet_event_12345",  // May be null initially
  "meetingInfo": {
    "title": "Team Meeting",
    "url": "https://meet.google.com/abc-defg-hij",
    "organizer": "user@example.com",
    "scheduledStartTime": "2025-07-23T10:00:00Z",
    "scheduledEndTime": "2025-07-23T11:00:00Z",
    "actualStartTime": "2025-07-23T10:02:00Z",
    "lastUpdated": "2025-07-23T10:15:00Z",
    "duration": 780,  // seconds
    "durationFormatted": "00:13:00",
    "status": "active",
    "recordingEnabled": false
  },
  "participants": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "role": "organizer",
      "joinedAt": "2025-07-23T10:00:00Z",
      "leftAt": null
    }
  ],
  "transcript": {
    "segments": [
      // Initially empty, then populated as audio is processed
      {
        "speaker": "John Doe",
        "text": "Hello everyone, let's start the meeting.",
        "startTime": 5.0,
        "endTime": 8.5,
        "confidence": 0.95,
        "id": "bot_1_transcript_seg_1",
        "sessionTime": 5000
      }
    ],
    "fullText": "",  // Concatenated text from all segments
    "wordCount": 0,
    "segmentCount": 0,
    "detectedLanguage": null,  // Will be detected from first speech
    "languageConfidence": 0,
    "speakers": [],  // List of unique speaker names
    "lastSegmentTime": 0
  },
  "aiSummary": {
    // Initially contains placeholder, updated every ~60 seconds
    "summary": {
      "brief": "Waiting for more content to generate summary...",
      "keyPoints": [],
      "decisions": [],
      "actionItems": [],
      "topics": [],
      "sentiment": "neutral",
      "nextSteps": []
    },
    "insights": {
      "participationRate": {},
      "mostDiscussedTopics": [],
      "meetingType": "unknown",
      "effectiveness": "unknown"
    },
    "metadata": {
      "generatedAt": null,
      "lastUpdated": null
    }
  },
  "botInfo": {
    "botId": "bot_1",
    "legacyBotId": "guest_bot_1753257649435_rbyt1d",
    "botName": "Meeting Bot",
    "status": "active"
  },
  "timestamps": {
    "sessionStarted": "2025-07-23T10:02:00Z",
    "lastTranscriptUpdate": "2025-07-23T10:15:00Z",
    "lastSummaryUpdate": "2025-07-23T10:15:00Z",
    "dataFetchedAt": "2025-07-23T10:15:30Z"
  }
}
```

## Implementation Guidelines

### 1. Initial Load
```javascript
const fetchTranscript = async (sessionId) => {
  try {
    const response = await fetch(
      `https://live-transcript-service-backend.dev.singularity-works.com/api/live-transcript/${sessionId}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Handle successful response
      updateUI(data);
    } else {
      // Handle API error
      console.error('API Error:', data.error);
    }
  } catch (error) {
    console.error('Fetch error:', error);
  }
};
```

### 2. Polling for Updates
```javascript
// Poll every 5 seconds for updates
const pollInterval = setInterval(() => {
  fetchTranscript(sessionId);
}, 5000);

// Clean up on unmount
onUnmount(() => {
  clearInterval(pollInterval);
});
```

### 3. Real-time Updates (SSE)
```javascript
const connectToLiveStream = (sessionId) => {
  const eventSource = new EventSource(
    `https://live-transcript-service-backend.dev.singularity-works.com/api/live-transcript/${sessionId}/live`
  );

  eventSource.addEventListener('transcript_update', (event) => {
    const update = JSON.parse(event.data);
    // Add new transcript segment to UI
    addTranscriptSegment(update);
  });

  eventSource.addEventListener('summary_update', (event) => {
    const update = JSON.parse(event.data);
    // Update AI summary section
    updateSummary(update.summary);
  });

  eventSource.addEventListener('error', (event) => {
    console.error('SSE Error:', event);
    eventSource.close();
  });

  return eventSource;
};
```

### 4. Handling Empty States
```javascript
const renderTranscript = (data) => {
  if (data.transcript.segments.length === 0) {
    return (
      <div className="empty-state">
        <p>Waiting for speech to begin...</p>
        <p>Meeting started: {data.meetingInfo.durationFormatted} ago</p>
      </div>
    );
  }
  
  // Render transcript segments
  return data.transcript.segments.map(segment => (
    <TranscriptSegment key={segment.id} segment={segment} />
  ));
};
```

## Important Notes

1. **No Breaking Changes**: The API response structure remains unchanged from the original documentation
2. **Session Availability**: Sessions are created immediately when bot joins, preventing 404 errors
3. **Progressive Loading**: Transcript data loads progressively as audio is processed
4. **AI Summary Timing**: Summaries generate after ~60 seconds of content, then update periodically
5. **Language Detection**: Detected from actual speech, not meeting metadata

## Error Handling

```javascript
const handleApiResponse = (response) => {
  if (!response.ok) {
    switch (response.status) {
      case 404:
        // Session not found (rare now, but possible if bot hasn't joined yet)
        console.error('Session not found. Bot may not have joined the meeting yet.');
        break;
      case 500:
        // Server error
        console.error('Server error. Please try again later.');
        break;
      case 503:
        // Service unavailable
        console.error('Service temporarily unavailable.');
        break;
      default:
        console.error(`Unexpected error: ${response.status}`);
    }
  }
};
```

## Testing

1. Use the debug endpoint to verify bot status:
   ```
   https://live-transcript-service-backend.dev.singularity-works.com/api/debug/transcript-sessions
   ```

2. Test with a known active session:
   ```
   https://live-transcript-service-backend.dev.singularity-works.com/api/live-transcript/bot_1_transcript
   ```

## Migration from Previous Implementation

If you were using `/api/enhanced-transcripts`, simply update your base path:

```javascript
// Old
const url = `${BASE_URL}/api/enhanced-transcripts/${sessionId}`;

// New (recommended)
const url = `${BASE_URL}/api/live-transcript/${sessionId}`;
```

Both endpoints work identically, but `/api/live-transcript` is the preferred naming.

## Support

For issues or questions:
- Check service health: https://live-transcript-service-backend.dev.singularity-works.com/health
- View active sessions: https://live-transcript-service-backend.dev.singularity-works.com/api/debug/transcript-sessions
- API documentation: See API_ENDPOINTS.md in the repository