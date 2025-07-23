# Live Transcript Service API Documentation

Base URL: `https://live-transcript-service-backend.dev.singularity-works.com`

## Table of Contents
- [Health & Status Endpoints](#health--status-endpoints)
- [Transcript Management Endpoints](#transcript-management-endpoints)
- [Enhanced Transcript Endpoints](#enhanced-transcript-endpoints)
- [Test Endpoints](#test-endpoints)
- [Server-Sent Events (SSE)](#server-sent-events-sse)
- [Error Responses](#error-responses)

---

## Health & Status Endpoints

### GET /health
Health check endpoint for monitoring service health.

**Response: 200 OK**
```json
{
  "status": "healthy",
  "timestamp": "2025-07-23T06:16:02.002Z",
  "uptime": 89.864587898,
  "checks": {
    "service": "healthy",
    "meetingBotAPI": "healthy",
    "geminiAPI": "configured",
    "memory": "healthy",
    "services": {
      "botPoolMonitor": "healthy",
      "audioFetchService": "healthy",
      "transcriptStreamService": "healthy"
    }
  },
  "memory": {
    "used": "14MB",
    "total": "15MB",
    "rss": "69MB",
    "external": "3MB",
    "systemUsedPercent": "13.75%"
  },
  "environment": {
    "nodeVersion": "v18.20.8",
    "platform": "linux",
    "cpus": 20
  },
  "responseTime": "23ms"
}
```

**Response: 503 Service Unavailable**
```json
{
  "status": "degraded",
  "timestamp": "2025-07-23T06:16:02.002Z",
  "checks": {
    "service": "healthy",
    "meetingBotAPI": "unhealthy",
    "geminiAPI": "configured",
    "memory": "healthy"
  }
}
```

### GET /health/live
Simple liveness probe endpoint.

**Response: 200 OK**
```json
{
  "status": "alive"
}
```

### GET /health/ready
Readiness probe to check if service is ready to handle requests.

**Response: 200 OK**
```json
{
  "ready": true,
  "reason": null
}
```

**Response: 503 Service Unavailable**
```json
{
  "ready": false,
  "reason": "Services not fully initialized"
}
```

### GET /api/status
Service status and statistics.

**Response: 200 OK**
```json
{
  "success": true,
  "status": "operational",
  "activeSessions": 2,
  "totalTranscriptions": 156,
  "geminiApiStatus": "configured",
  "botApiStatus": "connected",
  "uptime": 3600,
  "uptimeFormatted": "1h 0m 0s",
  "memoryUsage": "234MB",
  "version": "1.0.0",
  "environment": "production",
  "timestamp": "2025-07-23T10:00:00Z",
  "services": {
    "botPoolMonitor": {
      "status": "active",
      "activeBots": 3,
      "lastPoll": "2025-07-23T10:00:00Z",
      "pollInterval": "5000ms"
    },
    "audioFetchService": {
      "status": "active",
      "activeBuffers": 3,
      "buffers": [
        {
          "botId": "bot_1",
          "duration": "120s",
          "size": "1024KB",
          "lastFetch": "2025-07-23T10:00:00Z"
        }
      ]
    },
    "transcriptionService": {
      "totalRequests": 500,
      "successful": 495,
      "failed": 5,
      "successRate": "99.00%",
      "averageDuration": "250ms"
    },
    "transcriptStreamService": {
      "totalSessions": 156,
      "activeSessions": 2,
      "totalSegments": 12450,
      "totalWords": 145678
    }
  },
  "metrics": {
    "processingTime": "5ms"
  }
}
```

### GET /api/status/metrics
Detailed metrics endpoint.

**Response: 200 OK**
```json
{
  "timestamp": "2025-07-23T10:00:00Z",
  "transcription": {
    "totalRequests": 500,
    "successfulRequests": 495,
    "failedRequests": 5,
    "successRate": 0.99,
    "averageProcessingTime": 250,
    "totalProcessingTime": 125000
  },
  "sessions": {
    "active": 2,
    "details": [
      {
        "sessionId": "bot_1_transcript",
        "duration": "00:20:34",
        "wordCount": 4567,
        "language": "en",
        "speakers": 3
      }
    ]
  },
  "system": {
    "cpuUsage": {
      "user": 123456,
      "system": 78901
    },
    "memoryUsage": {
      "rss": 245366784,
      "heapTotal": 157810688,
      "heapUsed": 123456789,
      "external": 3456789
    }
  }
}
```

### GET /api/status/config
Service configuration (non-sensitive) endpoint.

**Response: 200 OK**
```json
{
  "service": {
    "name": "live-transcript-service",
    "version": "1.0.0",
    "environment": "production",
    "port": 3003
  },
  "features": {
    "speakerDiarization": true,
    "languageDetection": true,
    "supportedLanguages": ["en", "de", "es", "fr", "it", "pt", "nl", "pl"],
    "maxTranscriptLength": 500000
  },
  "limits": {
    "audioFetchInterval": 5000,
    "audioBufferSize": 30
  },
  "apis": {
    "meetingBotAPI": {
      "configured": true,
      "url": "meeting-bot-backend.dev.singularity-works.com"
    },
    "geminiAPI": {
      "configured": true,
      "model": "gemini-1.5-flash"
    }
  }
}
```

---

## Transcript Management Endpoints

### GET /api/transcripts/active
List all active transcription sessions.

**Response: 200 OK**
```json
{
  "success": true,
  "count": 2,
  "sessions": [
    {
      "sessionId": "bot_1_transcript",
      "botId": "bot_1",
      "legacyBotId": "guest_bot_1737543210000_abc123",
      "meetingUrl": "https://meet.google.com/abc-defg-hij",
      "startedAt": "2025-01-23T10:00:00Z",
      "duration": 1234,
      "durationFormatted": "00:20:34",
      "transcriptLength": 4567,
      "lastUpdated": "2025-01-23T10:20:34Z",
      "status": "active",
      "detectedLanguage": "en",
      "languageConfidence": 0.98,
      "speakerCount": 3,
      "wordCount": 4567
    },
    {
      "sessionId": "bot_2_transcript",
      "botId": "bot_2",
      "legacyBotId": "guest_bot_1737543210000_xyz789",
      "meetingUrl": "https://meet.google.com/xyz-uvwx-ijk",
      "startedAt": "2025-01-23T09:30:00Z",
      "duration": 3045,
      "durationFormatted": "00:50:45",
      "transcriptLength": 12890,
      "lastUpdated": "2025-01-23T10:20:45Z",
      "status": "active",
      "detectedLanguage": "de",
      "languageConfidence": 0.95,
      "speakerCount": 5,
      "wordCount": 8901
    }
  ]
}
```

### GET /api/transcripts/:sessionId
Get full transcript for a specific session.

**Response: 200 OK**
```json
{
  "success": true,
  "sessionId": "bot_1_transcript",
  "botId": "bot_1",
  "meetingUrl": "https://meet.google.com/abc-defg-hij",
  "transcript": {
    "segments": [
      {
        "speaker": "Speaker 1",
        "text": "Hello everyone, let's begin the meeting.",
        "startTime": 5.0,
        "endTime": 8.5,
        "confidence": 0.95,
        "id": "bot_1_transcript_seg_1",
        "sessionTime": 5000
      },
      {
        "speaker": "Speaker 2",
        "text": "Thank you for joining. Today we'll discuss the project roadmap.",
        "startTime": 9.0,
        "endTime": 13.5,
        "confidence": 0.92,
        "id": "bot_1_transcript_seg_2",
        "sessionTime": 9000
      }
    ],
    "fullText": "Hello everyone, let's begin the meeting. Thank you for joining. Today we'll discuss the project roadmap.",
    "wordCount": 15,
    "duration": 13.5,
    "detectedLanguage": "en",
    "languageConfidence": 0.98,
    "alternativeLanguages": [
      { "language": "de", "confidence": 0.15 },
      { "language": "es", "confidence": 0.08 }
    ],
    "speakers": ["Speaker 1", "Speaker 2"]
  },
  "metadata": {
    "startedAt": "2025-01-23T10:00:00Z",
    "lastUpdated": "2025-01-23T10:20:34Z",
    "status": "active",
    "durationFormatted": "00:20:34"
  }
}
```

**Response: 404 Not Found**
```json
{
  "success": false,
  "error": {
    "message": "Session bot_999_transcript not found",
    "type": "Error"
  },
  "timestamp": "2025-01-23T10:00:00Z"
}
```

### POST /api/transcripts/:sessionId/stop
Stop transcription for a specific session.

**Request Body:** None required

**Response: 200 OK**
```json
{
  "success": true,
  "message": "Transcription stopped for session bot_1_transcript",
  "sessionId": "bot_1_transcript"
}
```

**Response: 404 Not Found**
```json
{
  "success": false,
  "error": {
    "message": "Session bot_999_transcript not found",
    "type": "Error"
  },
  "timestamp": "2025-01-23T10:00:00Z"
}
```

### GET /api/transcripts/stats/summary
Get transcript statistics summary.

**Response: 200 OK**
```json
{
  "success": true,
  "stats": {
    "totalSessions": 156,
    "activeSessions": 2,
    "totalSegments": 12450,
    "totalWords": 145678,
    "averageWordsPerSession": 933,
    "languageDistribution": {
      "en": 89,
      "de": 45,
      "es": 12,
      "fr": 8,
      "unknown": 2
    },
    "transcriptionPerformance": {
      "total": 500,
      "successful": 495,
      "failed": 5,
      "averageDuration": 250,
      "successRate": 0.99
    }
  }
}
```

### GET /api/transcripts/:sessionId/download
Download transcript in various formats.

**Query Parameters:**
- `format` (optional): `txt`, `json`, or `srt` (default: `txt`)

**Response: 200 OK (format=txt)**
```
Content-Type: text/plain
Content-Disposition: attachment; filename="transcript_bot_1_transcript.txt"

Transcript for Meeting: https://meet.google.com/abc-defg-hij
Session ID: bot_1_transcript
Started: 2025-01-23T10:00:00Z
Duration: 00:20:34
Language: en
Speakers: Speaker 1, Speaker 2
Word Count: 4567
================================================================================

[00:00:05] Speaker 1: Hello everyone, let's begin the meeting.

[00:00:09] Speaker 2: Thank you for joining. Today we'll discuss the project roadmap.
```

**Response: 200 OK (format=srt)**
```
Content-Type: text/plain
Content-Disposition: attachment; filename="transcript_bot_1_transcript.srt"

1
00:00:05,000 --> 00:00:08,500
Speaker 1: Hello everyone, let's begin the meeting.

2
00:00:09,000 --> 00:00:13,500
Speaker 2: Thank you for joining. Today we'll discuss the project roadmap.
```

---

## Server-Sent Events (SSE)

### GET /api/transcripts/:sessionId/live
Real-time transcript updates via Server-Sent Events.

**Initial Connection:**
```
event: connected
data: {"message":"Connected to transcript stream","sessionId":"bot_1_transcript","currentDuration":1234,"wordCount":4567,"segmentCount":45}
```

**Transcript Updates:**
```
event: transcript_update
data: {"timestamp":"2025-01-23T10:20:34Z","speaker":"Speaker 1","text":"Let me share my screen.","startTime":1234.5,"endTime":1237.0,"confidence":0.94}

event: speaker_change
data: {"timestamp":"2025-01-23T10:20:40Z","previousSpeaker":"Speaker 1","currentSpeaker":"Speaker 2"}

event: session_update
data: {"wordCount":4590,"duration":1240,"speakerCount":3,"detectedLanguage":"en"}

event: ping
data: {"timestamp":"2025-01-23T10:21:04Z"}
```

**Session Stopped:**
```
event: session_stopped
data: {"sessionId":"bot_1_transcript","timestamp":"2025-01-23T10:30:00Z"}
```

---

## Enhanced Transcript Endpoints

### GET /api/enhanced-transcripts/:sessionId
Get complete transcript with AI summary and meeting metadata - **PRIMARY ENDPOINT FOR FRONTEND**.

**Response: 200 OK**
```json
{
  "success": true,
  "sessionId": "bot_1_transcript",
  "event_id": "meet_event_12345",
  "meetingInfo": {
    "title": "Weekly Team Standup",
    "url": "https://meet.google.com/abc-defg-hij",
    "organizer": "john.doe@company.com",
    "scheduledStartTime": "2025-01-23T10:00:00Z",
    "scheduledEndTime": "2025-01-23T11:00:00Z",
    "actualStartTime": "2025-01-23T10:02:00Z",
    "lastUpdated": "2025-01-23T10:45:00Z",
    "duration": 2580,
    "durationFormatted": "00:43:00",
    "status": "active",
    "recordingEnabled": true
  },
  "participants": [
    {
      "name": "John Doe",
      "email": "john.doe@company.com",
      "role": "organizer",
      "joinedAt": "2025-01-23T10:00:00Z",
      "leftAt": null
    },
    {
      "name": "Jane Smith",
      "email": "jane.smith@company.com",
      "role": "participant",
      "joinedAt": "2025-01-23T10:05:00Z",
      "leftAt": null
    }
  ],
  "transcript": {
    "segments": [
      {
        "speaker": "John Doe",
        "text": "Good morning everyone, let's start our standup.",
        "startTime": 5.0,
        "endTime": 8.5,
        "confidence": 0.95,
        "id": "bot_1_transcript_seg_1",
        "sessionTime": 5000
      }
    ],
    "fullText": "Good morning everyone, let's start our standup...",
    "wordCount": 4567,
    "segmentCount": 145,
    "detectedLanguage": "en",
    "languageConfidence": 0.98,
    "alternativeLanguages": [
      { "language": "de", "confidence": 0.15 }
    ],
    "speakers": ["John Doe", "Jane Smith", "Mike Johnson"],
    "lastSegmentTime": 2580.5
  },
  "aiSummary": {
    "summary": {
      "brief": "Team standup discussing project Alpha progress, blockers in deployment pipeline, and upcoming sprint planning.",
      "keyPoints": [
        "Project Alpha frontend completed, moving to testing phase",
        "Deployment pipeline issues blocking staging releases",
        "Sprint planning scheduled for Friday"
      ],
      "decisions": [
        "Postpone staging deployment until pipeline fixed",
        "Allocate 2 developers to fix deployment issues"
      ],
      "actionItems": [
        {
          "task": "Fix deployment pipeline configuration",
          "assignee": "Mike Johnson",
          "deadline": "2025-01-24"
        }
      ],
      "topics": ["Project Alpha", "Deployment", "Sprint Planning"],
      "sentiment": "positive",
      "nextSteps": [
        "Continue Project Alpha testing",
        "Daily sync on deployment fix progress"
      ]
    },
    "insights": {
      "participationRate": {
        "John Doe": "35%",
        "Jane Smith": "40%",
        "Mike Johnson": "25%"
      },
      "mostDiscussedTopics": ["Deployment Issues", "Project Alpha", "Testing"],
      "meetingType": "standup",
      "effectiveness": "high - Clear action items and decisions made"
    },
    "metadata": {
      "generatedAt": "2025-01-23T10:45:00Z",
      "processingTime": 250,
      "lastUpdated": "2025-01-23T10:45:00Z"
    }
  },
  "botInfo": {
    "botId": "bot_1",
    "legacyBotId": "guest_bot_1737543210000_abc123",
    "botName": "Meeting Recorder",
    "status": "active"
  },
  "timestamps": {
    "sessionStarted": "2025-01-23T10:02:00Z",
    "lastTranscriptUpdate": "2025-01-23T10:45:00Z",
    "lastSummaryUpdate": "2025-01-23T10:45:00Z",
    "dataFetchedAt": "2025-01-23T10:45:30Z"
  }
}
```

### GET /api/enhanced-transcripts/active/list
List all active enhanced transcript sessions.

**Response: 200 OK**
```json
{
  "success": true,
  "count": 2,
  "sessions": [
    {
      "sessionId": "bot_1_transcript",
      "botId": "bot_1",
      "meetingUrl": "https://meet.google.com/abc-defg-hij",
      "event_id": "meet_event_12345",
      "meetingTitle": "Weekly Team Standup",
      "participants": 5,
      "duration": 1234,
      "durationFormatted": "00:20:34",
      "wordCount": 4567,
      "detectedLanguage": "en",
      "hasSummary": true,
      "lastSummaryUpdate": "2025-01-23T10:20:00Z",
      "status": "active"
    }
  ]
}
```

### POST /api/enhanced-transcripts/:sessionId/update-summary
Force update AI summary for a session.

**Response: 200 OK**
```json
{
  "success": true,
  "message": "AI summary updated successfully",
  "sessionId": "bot_1_transcript",
  "summary": {
    "summary": {
      "brief": "Updated summary content..."
    }
  }
}
```

### GET /api/enhanced-transcripts/:sessionId/live
Enhanced SSE endpoint with meeting metadata and summary updates.

**Initial Connection:**
```
event: connected
data: {"sessionId":"bot_1_transcript","event_id":"meet_event_12345","meetingTitle":"Weekly Team Standup","participants":[{"name":"John Doe"}],"currentDuration":1234,"wordCount":4567,"hasSummary":true}
```

**Summary Updates:**
```
event: summary_update
data: {"timestamp":"2025-01-23T10:45:00Z","summary":{"brief":"Updated meeting summary...","keyPoints":["New key point"]},"lastUpdated":"2025-01-23T10:45:00Z"}
```

---

## Debug Endpoints (Development Only)

### GET /api/debug/bot-pool
Check the bot pool status and active bots.

**Response: 200 OK**
```json
{
  "success": true,
  "pool": {
    "isMonitoring": true,
    "activeBotCount": 1,
    "lastPollTime": "2025-07-23T08:01:00Z",
    "pollInterval": 5000,
    "apiUrl": "https://meeting-bot-backend.dev.singularity-works.com"
  },
  "bots": [
    {
      "poolBotId": "bot_1",
      "legacyBotId": "guest_bot_1753257649435_rbyt1d",
      "status": "active",
      "meetingUrl": "https://meet.google.com/fmf-eygo-sno",
      "userEmail": "roncymondllave25@gmail.com",
      "participants": {
        "count": 1,
        "list": ["Ron Cymond Llave"]
      },
      "duration": 120,
      "durationFormatted": "00:02:00",
      "audioBlobUrl": "/api/google-meet-guest/audio-blob/guest_bot_1753257649435_rbyt1d",
      "fullAudioBlobUrl": "https://meeting-bot-backend.dev.singularity-works.com/api/google-meet-guest/audio-blob/guest_bot_1753257649435_rbyt1d",
      "isNew": false,
      "lastSeen": "2025-07-23T08:03:00Z"
    }
  ]
}
```

### GET /api/debug/audio-buffers
Check audio buffer status.

**Response: 200 OK**
```json
{
  "success": true,
  "status": {
    "isRunning": true,
    "activeBuffers": 1,
    "bufferDetails": [
      {
        "legacyBotId": "guest_bot_1753257649435_rbyt1d",
        "botId": "bot_1",
        "size": 2048000,
        "duration": 120,
        "lastFetchTime": "2025-07-23T08:03:00Z"
      }
    ]
  }
}
```

### GET /api/debug/transcript-sessions
Check active transcript sessions.

**Response: 200 OK**
```json
{
  "success": true,
  "count": 1,
  "sessions": [
    {
      "sessionId": "bot_1_transcript",
      "botId": "bot_1",
      "legacyBotId": "guest_bot_1753257649435_rbyt1d",
      "meetingUrl": "https://meet.google.com/fmf-eygo-sno",
      "status": "active",
      "segmentCount": 15,
      "wordCount": 567,
      "duration": 120,
      "hasMetadata": true,
      "hasSummary": true,
      "eventId": null
    }
  ]
}
```

### POST /api/debug/force-poll
Force an immediate poll of the bot pool.

**Response: 200 OK**
```json
{
  "success": true,
  "message": "Forced bot pool poll completed"
}
```

---

## Test Endpoints

### GET /test-supabase
Test Supabase database connection.

**Response: 200 OK (Success)**
```json
{
  "success": true,
  "message": "Connected to Supabase successfully",
  "configured": true,
  "details": {
    "url": "https://your-project.supabase.co",
    "timestamp": "2025-01-23T10:00:00Z"
  },
  "responseTime": "145ms",
  "environment": {
    "NODE_ENV": "production",
    "hasUrl": true,
    "hasKey": true
  }
}
```

**Response: 503 Service Unavailable (Failed)**
```json
{
  "success": false,
  "error": "Connection timeout",
  "configured": true,
  "details": {
    "code": "ETIMEDOUT",
    "hint": "Check network connectivity"
  },
  "responseTime": "5000ms",
  "environment": {
    "NODE_ENV": "production",
    "hasUrl": true,
    "hasKey": true
  }
}
```

### GET /test-supabase/status
Get Supabase configuration status.

**Response: 200 OK**
```json
{
  "initialized": true,
  "configured": true,
  "environment": {
    "hasUrl": true,
    "hasKey": true,
    "urlPrefix": "https://your-project.supabase.co..."
  }
}
```

---

## Error Responses

All error responses follow this format:

**400 Bad Request**
```json
{
  "success": false,
  "error": {
    "message": "Session ID is required",
    "type": "ValidationError",
    "field": "sessionId"
  },
  "timestamp": "2025-01-23T10:00:00Z"
}
```

**404 Not Found**
```json
{
  "success": false,
  "error": {
    "message": "Resource not found",
    "type": "NotFoundError"
  },
  "timestamp": "2025-01-23T10:00:00Z"
}
```

**429 Too Many Requests**
```json
{
  "success": false,
  "error": {
    "message": "Rate limit exceeded for Gemini API",
    "type": "RateLimitError",
    "service": "Gemini API",
    "retryAfter": 60000
  },
  "timestamp": "2025-01-23T10:00:00Z"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "error": {
    "message": "Internal server error",
    "type": "Error"
  },
  "timestamp": "2025-01-23T10:00:00Z"
}
```

**503 Service Unavailable**
```json
{
  "success": false,
  "error": {
    "message": "External API Error (Meeting Bot API): Connection failed",
    "type": "ExternalAPIError",
    "service": "Meeting Bot API"
  },
  "timestamp": "2025-01-23T10:00:00Z"
}
```

---

## Rate Limiting

All API endpoints are rate limited:
- **Limit**: 1000 requests per 15 minutes per IP
- **Headers**: Standard rate limit headers are included in responses
  - `X-RateLimit-Limit`: 1000
  - `X-RateLimit-Remaining`: 999
  - `X-RateLimit-Reset`: 1737625200

---

## Authentication

Currently, the API does not require authentication. Future versions will implement JWT-based authentication.

---

## CORS

The API supports CORS with the following configuration:
- **Allowed Origins**: `*` (all origins in development, specific domains in production)
- **Allowed Methods**: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`
- **Allowed Headers**: `Content-Type`, `Authorization`
- **Credentials**: Supported

---

## Webhooks (Future)

Webhook support is planned for future releases to notify external services of:
- New transcription sessions
- Transcript updates
- Session completions
- Error events

---

## Usage Examples

### cURL Examples

**Check Health:**
```bash
curl https://live-transcript-service-backend.dev.singularity-works.com/health
```

**Get Active Sessions:**
```bash
curl https://live-transcript-service-backend.dev.singularity-works.com/api/transcripts/active
```

**Get Specific Transcript:**
```bash
curl https://live-transcript-service-backend.dev.singularity-works.com/api/transcripts/bot_1_transcript
```

**Connect to Live Stream:**
```bash
curl -N https://live-transcript-service-backend.dev.singularity-works.com/api/transcripts/bot_1_transcript/live
```

**Download Transcript:**
```bash
curl -O https://live-transcript-service-backend.dev.singularity-works.com/api/transcripts/bot_1_transcript/download?format=txt
```

### JavaScript/Fetch Examples

**Get Active Sessions:**
```javascript
const response = await fetch('https://live-transcript-service-backend.dev.singularity-works.com/api/transcripts/active');
const data = await response.json();
console.log(data.sessions);
```

**Connect to SSE Stream:**
```javascript
const eventSource = new EventSource('https://live-transcript-service-backend.dev.singularity-works.com/api/transcripts/bot_1_transcript/live');

eventSource.addEventListener('transcript_update', (event) => {
  const data = JSON.parse(event.data);
  console.log(`${data.speaker}: ${data.text}`);
});

eventSource.addEventListener('error', (event) => {
  console.error('SSE Error:', event);
  eventSource.close();
});
```

---

## Changelog

### Version 1.0.0 (Current)
- Initial release
- Real-time transcription via Google Gemini
- Multi-language support
- Speaker diarization
- SSE streaming
- Export formats (TXT, JSON, SRT)

---

## Support

For issues or questions:
- GitHub Issues: [Repository Issues](https://github.com/your-repo/issues)
- API Status: Check `/health` endpoint
- Logs: Available via `/api/status` endpoint