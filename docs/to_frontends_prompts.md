# Frontend Integration Guide for Live Transcript Service

## Overview
The Live Transcript Service provides real-time transcription and AI summaries for Google Meet meetings. This guide helps frontend developers integrate with the service API.

## Key Updates (Latest)
- Service now recovers automatically when Meeting Bot API becomes unavailable
- Added `/api/live-transcript` endpoint alias for backward compatibility  
- Enhanced error handling and resilience features
- Fixed audio processing issues - transcripts now generate properly

## Base URL
```
https://live-transcript-service-backend.dev.singularity-works.com
```

## Primary Endpoints

### 1. Enhanced Transcripts Endpoint (by Event ID)
**URL:** `/api/enhanced-transcripts/:eventId` or `/api/live-transcript/:eventId`

**Method:** `GET`

**Description:** Returns combined raw transcripts, AI summary, and meeting metadata in a single response.

**Parameters:**
- `eventId` (required): The Google Meet event ID (scheduled meeting ID)

### 2. List Active Transcript Sessions
**URL:** `/api/transcript-sessions`

**Method:** `GET`

**Description:** Lists all active transcript sessions with their event IDs and status.

**Response:**
```json
{
  "success": true,
  "count": 2,
  "sessions": [
    {
      "sessionId": "bot_1_transcript",
      "event_id": "google_meet_event_123",
      "live_transcript_url": "https://live-transcript-service-backend.dev.singularity-works.com/api/live-transcript/google_meet_event_123",
      "botId": "bot_1",
      "meetingUrl": "https://meet.google.com/abc-defg-hij",
      "status": "active",
      "startedAt": "2025-07-23T10:00:00.000Z",
      "lastUpdated": "2025-07-23T10:15:00.000Z",
      "duration": 900,
      "segmentCount": 45,
      "wordCount": 1250,
      "speakerCount": 3,
      "hasAiSummary": true,
      "participants": 5,
      "detectedLanguage": "en"
    }
  ]
}
```

### 3. Get Session Info by Event ID
**URL:** `/api/transcript-sessions/event/:eventId`

**Method:** `GET`

**Description:** Get transcript session information for a specific event ID.

**Parameters:**
- `eventId` (required): The Google Meet event ID

**Response Format:**
```json
{
  "success": true,
  "sessionId": "session_abc123",
  "event_id": "google_meet_event_123",
  "meetingInfo": {
    "botId": "bot_123",
    "meetingUrl": "https://meet.google.com/abc-defg-hij",
    "startTime": "2025-07-23T10:00:00.000Z",
    "duration": 3600
  },
  "participants": [
    {
      "id": "participant_1",
      "name": "John Doe",
      "email": "john@example.com",
      "joinTime": "2025-07-23T10:00:00.000Z"
    }
  ],
  "transcript": {
    "segments": [
      {
        "speaker": "Speaker 1",
        "text": "Hello everyone, let's start the meeting.",
        "timestamp": "00:00:05",
        "startTimestamp": "00:00:05",
        "endTimestamp": "00:00:08",
        "startTime": 5.0,
        "endTime": 8.5,
        "language": "en",
        "confidence": 0.95,
        "id": "session_abc123_seg_1",
        "sessionTime": 5000
      }
    ],
    "metadata": {
      "totalSegments": 45,
      "duration": 3600,
      "languages": ["en"],
      "lastUpdated": "2025-07-23T11:00:00.000Z"
    }
  },
  "aiSummary": {
    "summary": "## Meeting Summary\n\nThe team discussed project updates...",
    "keyPoints": [
      "Project timeline reviewed",
      "Budget approved for Q3"
    ],
    "actionItems": [
      {
        "task": "Submit design mockups",
        "assignee": "John Doe",
        "dueDate": "2025-07-30"
      }
    ],
    "metadata": {
      "generatedAt": "2025-07-23T11:00:00.000Z",
      "model": "gemini-1.5-flash"
    }
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "message": "Session not found",
    "type": "NotFoundError"
  },
  "timestamp": "2025-07-23T10:00:00.000Z"
}
```

## Implementation Example

### React Component
```javascript
import { useState, useEffect } from 'react';

const LiveTranscriptModal = ({ botId, isOpen, onClose }) => {
  const [transcriptData, setTranscriptData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && botId) {
      fetchTranscriptData();
    }
  }, [isOpen, botId]);

  const fetchTranscriptData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // First, get the event ID if you only have botId
      // Or use the event ID directly if you already have it
      const eventId = 'your_event_id'; // Get this from your meeting data
      
      const response = await fetch(
        `https://live-transcript-service-backend.dev.singularity-works.com/api/live-transcript/${eventId}`
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to fetch transcript');
      }
      
      setTranscriptData(data);
    } catch (err) {
      console.error('Live transcript API error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Or fetch all active sessions first
  const fetchActiveSessions = async () => {
    const response = await fetch(
      'https://live-transcript-service-backend.dev.singularity-works.com/api/transcript-sessions'
    );
    const data = await response.json();
    
    // Each session now includes the complete live_transcript_url
    data.sessions.forEach(session => {
      console.log(`Event ${session.event_id}: ${session.live_transcript_url}`);
    });
    
    return data.sessions;
  };
  
  // Example: Direct access to transcript using the URL from sessions list
  const session = await fetchActiveSessions();
  const transcriptUrl = session[0].live_transcript_url;
  const transcriptResponse = await fetch(transcriptUrl);

  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>Live Transcript</h2>
        
        {loading && <div>Loading transcript...</div>}
        
        {error && (
          <div className="error">
            Error: {error}
          </div>
        )}
        
        {transcriptData && (
          <>
            {/* Meeting Info */}
            <div className="meeting-info">
              <h3>Meeting Details</h3>
              <p>Event ID: {transcriptData.event_id}</p>
              <p>Duration: {transcriptData.meetingInfo.duration}s</p>
              <p>Participants: {transcriptData.participants.length}</p>
            </div>

            {/* Raw Transcript */}
            <div className="transcript">
              <h3>Transcript</h3>
              {transcriptData.transcript.segments.map((segment, index) => (
                <div key={segment.id} className="segment">
                  <span className="time-range">
                    {segment.startTimestamp} - {segment.endTimestamp}
                  </span>
                  <span className="speaker">{segment.speaker}:</span>
                  <span className="text">{segment.text}</span>
                  {segment.confidence < 0.8 && (
                    <span className="low-confidence" title={`Confidence: ${(segment.confidence * 100).toFixed(0)}%`}>
                      ⚠️
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* AI Summary */}
            <div className="ai-summary">
              <h3>AI Summary</h3>
              <div dangerouslySetInnerHTML={{ 
                __html: transcriptData.aiSummary.summary 
              }} />
              
              {transcriptData.aiSummary.actionItems?.length > 0 && (
                <div className="action-items">
                  <h4>Action Items</h4>
                  <ul>
                    {transcriptData.aiSummary.actionItems.map((item, index) => (
                      <li key={index}>
                        {item.task} - {item.assignee} (Due: {item.dueDate})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
        
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default LiveTranscriptModal;
```

## Real-time Updates with SSE

For real-time transcript updates, use Server-Sent Events:

```javascript
const useTranscriptStream = (botId) => {
  const [transcript, setTranscript] = useState([]);
  
  useEffect(() => {
    if (!botId) return;
    
    const eventSource = new EventSource(
      `https://live-transcript-service-backend.dev.singularity-works.com/api/stream/${botId}`
    );
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'transcript_segment') {
        setTranscript(prev => [...prev, data.segment]);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
    };
    
    return () => {
      eventSource.close();
    };
  }, [botId]);
  
  return transcript;
};
```

## Error Handling Best Practices

1. **Network Errors**: Implement retry logic with exponential backoff
2. **404 Errors**: Session not found - bot may not be active
3. **503 Errors**: Service temporarily unavailable - retry after delay
4. **425 Errors**: Audio not ready yet - normal during meeting start

## Rate Limiting

The API implements rate limiting:
- 100 requests per minute per IP
- Use appropriate caching and debouncing in your frontend

## Bot ID Reference

Get the bot ID from the Meeting Bot backend's active pool endpoint:
```
https://meeting-bot-backend.dev.singularity-works.com/api/google-meet-guest/pool/active
```

Response includes:
```json
{
  "bots": [
    {
      "poolBotId": "bot_123",
      "legacyBotId": "legacy_bot_456",
      "meetingUrl": "https://meet.google.com/abc-defg-hij",
      "status": "in_meeting"
    }
  ]
}
```

Use the `poolBotId` value when calling the transcript API.

## Testing

Test endpoints available for development:
- `/api/test/transcription/:botId` - Test transcription for a specific bot
- `/api/health` - Check service health

## Support

For issues or questions:
- Check service health at `/api/health`
- Review logs for error details
- Contact the backend team with session ID and timestamp