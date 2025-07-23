# Live Transcript Service - Backend Project Setup Prompt

## Project Overview
Create a Node.js backend service called "Live Transcript Service" that consumes audio streams from the Meeting Bot API, transcribes them using Google Gemini API, and provides real-time transcripts through its own API endpoints.

## Core Requirements

### 1. Project Structure
Create a new Node.js project with the following structure:
```
live-transcript-service/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── transcripts.js
│   │   │   ├── health.js
│   │   │   └── status.js
│   │   └── server.js
│   ├── services/
│   │   ├── AudioFetchService.js
│   │   ├── GeminiTranscriptionService.js
│   │   ├── TranscriptStreamService.js
│   │   └── BotPoolMonitor.js
│   ├── utils/
│   │   ├── Logger.js
│   │   ├── AudioProcessor.js
│   │   └── ErrorHandler.js
│   └── index.js
├── .env.example
├── .env
├── package.json
├── Dockerfile
├── Dockerfile.dev
├── docker-compose.yml
├── docker-compose.dev.yml
└── README.md
```

### 2. Environment Variables (.env)
Create an `.env` file with the following variables:
```env
# Server Configuration
PORT=3003
NODE_ENV=development
SERVICE_NAME=live-transcript-service

# Meeting Bot API Configuration
MEETING_BOT_API_URL=https://meeting-bot-backend.dev.singularity-works.com
MEETING_BOT_API_KEY=optional-api-key

# Google Gemini API Configuration
GOOGLE_GEMINI_API_KEY=your-gemini-api-key
GOOGLE_GEMINI_MODEL=gemini-1.5-flash
GEMINI_AUDIO_SAMPLE_RATE=16000

# Audio Processing Configuration
AUDIO_FETCH_INTERVAL=5000  # Fetch audio every 5 seconds
AUDIO_BUFFER_SIZE=30  # Keep last 30 seconds for context
AUDIO_FORMAT=WAV

# Transcript Configuration
TRANSCRIPT_LANGUAGE=auto  # Auto-detect language (supports multiple languages)
ENABLE_SPEAKER_DIARIZATION=true
MAX_TRANSCRIPT_LENGTH=500000  # Maximum characters per transcript (supports ~8-10 hours)
TRANSCRIPT_LANGUAGE_HINTS=en,de,es,fr,it,pt,nl,pl  # Language hints for better detection

# Service Configuration
ENABLE_HEALTH_CHECKS=true
LOG_LEVEL=info
ENABLE_METRICS=true
```

### 3. Core Services Implementation

#### AudioFetchService.js
```javascript
// This service should:
// 1. Poll the Meeting Bot API for active bots using /api/google-meet-guest/pool/status
// 2. For each bot with status "in_meeting", fetch audio from /api/google-meet-guest/audio-blob/{legacyBotId}
// 3. Handle audio buffering and incremental fetching
// 4. Detect new audio segments and pass them to transcription service
// 5. Manage multiple concurrent bot audio streams
```

#### GeminiTranscriptionService.js
```javascript
// This service should:
// 1. Initialize Google Gemini API client
// 2. Convert audio blob to format compatible with Gemini
// 3. Send audio chunks to Gemini for transcription
// 4. Handle automatic language detection (multi-language support)
// 5. Handle speaker diarization if enabled
// 6. Manage rate limiting and API quotas
// 7. Implement retry logic for failed transcriptions
// 8. Format transcripts with timestamps, speaker labels, and detected language
// 9. Support long-duration meetings (8+ hours) with chunked processing
```

#### TranscriptStreamService.js
```javascript
// This service should:
// 1. Manage real-time transcript streams for each active meeting
// 2. Store transcript segments in memory (database integration later)
// 3. Handle WebSocket connections for real-time updates
// 4. Provide HTTP endpoints for fetching current transcripts
// 5. Implement transcript merging and deduplication
// 6. Clean up completed meeting transcripts
```

### 4. API Endpoints

#### GET /health
Health check endpoint that verifies:
- Service is running
- Can connect to Meeting Bot API
- Google Gemini API is accessible
- Memory usage is within limits

#### GET /api/transcripts/active
Returns list of all active transcription sessions:
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
      "languageConfidence": 0.98
    }
  ]
}
```

#### GET /api/transcripts/:sessionId
Get full transcript for a specific session:
```json
{
  "success": true,
  "sessionId": "bot_1_transcript",
  "botId": "bot_1",
  "meetingUrl": "https://meet.google.com/abc-defg-hij",
  "transcript": {
    "segments": [
      {
        "timestamp": "2025-01-23T10:00:05Z",
        "speaker": "Speaker 1",
        "text": "Hello everyone, let's begin the meeting.",
        "confidence": 0.95,
        "startTime": 5.0,
        "endTime": 8.5
      }
    ],
    "fullText": "Full transcript text here...",
    "wordCount": 456,
    "duration": 1234,
    "detectedLanguage": "en",
    "languageConfidence": 0.98,
    "alternativeLanguages": [
      { "language": "de", "confidence": 0.15 },
      { "language": "es", "confidence": 0.08 }
    ]
  }
}
```

#### GET /api/transcripts/:sessionId/live
Server-Sent Events (SSE) endpoint for real-time transcript updates:
```
event: transcript_update
data: {"timestamp":"2025-01-23T10:20:34Z","speaker":"Speaker 2","text":"I agree with that point.","startTime":1234.5}

event: speaker_change
data: {"timestamp":"2025-01-23T10:20:40Z","previousSpeaker":"Speaker 2","currentSpeaker":"Speaker 1"}
```

#### POST /api/transcripts/:sessionId/stop
Stop transcription for a specific session (manual stop)

#### GET /api/status
Service status and statistics:
```json
{
  "success": true,
  "status": "operational",
  "activeSessions": 2,
  "totalTranscriptions": 156,
  "geminiApiStatus": "healthy",
  "botApiStatus": "connected",
  "uptime": 3600,
  "memoryUsage": "234MB",
  "version": "1.0.0"
}
```

### 5. Docker Configuration

#### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies for audio processing
RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3003

CMD ["node", "src/index.js"]
```

#### docker-compose.yml
```yaml
version: '3.8'

services:
  live-transcript-service:
    build: .
    container_name: live-transcript-service
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    labels:
      - "coolify.managed=true"
      - "coolify.type=application"
      - "coolify.name=live-transcript-service"
```

### 6. Implementation Guidelines

#### Audio Processing Flow
1. Poll Meeting Bot API every 5 seconds for active bots
2. For each active bot, check if audio has new content
3. Fetch only the new audio segments (incremental approach)
4. Convert audio to format required by Gemini API
5. Send to Gemini for transcription
6. Process and format the transcript response
7. Update the transcript stream for that session
8. Emit real-time updates via SSE

#### Error Handling
- Implement exponential backoff for API failures
- Handle Meeting Bot API downtime gracefully
- Queue transcription requests if Gemini API is rate limited
- Log all errors with context for debugging
- Provide fallback mechanisms for critical failures

#### Performance Considerations
- Use streaming for large audio files
- Implement audio chunking for long meetings (process in 5-minute segments)
- For meetings over 2 hours, implement progressive transcript storage
- Cache recent transcripts in memory with size limits
- Use connection pooling for API requests
- Implement graceful shutdown procedures
- Monitor memory usage for long-running transcriptions
- Consider transcript compression for storage efficiency

### 7. Integration with Meeting Bot API

The service should integrate with these Meeting Bot endpoints:

1. **Get Active Bots**: `GET /api/google-meet-guest/pool/status?includeMetadata=true`
   - Poll this endpoint to find bots with status "in_meeting"
   - Extract legacyBotId for audio fetching

2. **Fetch Audio Blob**: `GET /api/google-meet-guest/audio-blob/{legacyBotId}`
   - Use the legacyBotId from active bots
   - This returns WAV audio data
   - Implement incremental fetching based on Content-Length

3. **Monitor Bot Status**: Track when bots leave meetings to stop transcription

### 8. Google Gemini API Integration

```javascript
// Example Gemini integration pattern
const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiTranscriptionService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ 
      model: process.env.GOOGLE_GEMINI_MODEL 
    });
  }

  async transcribeAudio(audioBuffer) {
    // Convert audio buffer to base64
    const audioBase64 = audioBuffer.toString('base64');
    
    // Create prompt for transcription
    const prompt = {
      contents: [{
        parts: [
          {
            text: "Transcribe this audio with speaker labels and timestamps. Auto-detect the language. Include the detected language and confidence score. Format as JSON."
          },
          {
            inlineData: {
              mimeType: "audio/wav",
              data: audioBase64
            }
          }
        ]
      }]
    };

    // Send to Gemini
    const result = await this.model.generateContent(prompt);
    return this.parseTranscriptionResponse(result);
  }
}
```

### 9. Development Workflow

1. **Local Development**:
   ```bash
   # Install dependencies
   npm install
   
   # Run in development mode
   npm run dev
   
   # Run with Docker
   docker-compose -f docker-compose.dev.yml up
   ```

2. **Testing**:
   - Unit tests for each service
   - Integration tests for API endpoints
   - Mock Meeting Bot API responses for testing
   - Test with sample audio files

3. **Deployment to Coolify**:
   - Push to Git repository
   - Configure Coolify to use Dockerfile
   - Set environment variables in Coolify
   - Enable health checks
   - Configure domain and SSL

### 10. Future Enhancements (for database integration)

When database is added, consider:
- Store transcripts in PostgreSQL/Supabase
- Implement transcript search functionality
- Add user authentication and access control
- Create transcript export features (PDF, TXT, SRT)
- Implement transcript editing capabilities
- Add analytics and usage tracking

### 11. Monitoring and Logging

Implement comprehensive logging:
```javascript
const logger = {
  info: (message, meta) => console.log(`[INFO] ${message}`, meta),
  error: (message, error) => console.error(`[ERROR] ${message}`, error),
  debug: (message, data) => console.debug(`[DEBUG] ${message}`, data),
  metric: (name, value) => console.log(`[METRIC] ${name}: ${value}`)
};
```

Track key metrics:
- Transcription success rate
- Average processing time
- API usage and costs
- Active session count
- Error rates by type

## Summary

This Live Transcript Service will:
1. Connect to the Meeting Bot API to find active meetings
2. Fetch audio blobs from bots in meetings
3. Send audio to Google Gemini for transcription
4. Provide real-time transcript updates via API
5. Run as a containerized service on Coolify

The service is designed to be:
- Scalable: Handle multiple concurrent meetings
- Reliable: Graceful error handling and recovery
- Real-time: Live transcript updates as meeting progresses
- Extensible: Easy to add database and additional features later