# Live Transcript Service

A Node.js backend service that consumes audio streams from the Meeting Bot API, transcribes them using Google Gemini API, and provides real-time transcripts through API endpoints.

**Note: Automatic transcription is currently disabled. The service operates in frontend-initiated mode only, where transcription requests are made via POST endpoints.**

## Recent Updates (July 25, 2025)

- **Fixed Audio Processing**: Added automatic audio format detection for MP3/WAV/M4A files
- **Database Schema Fix**: Now only updates existing columns (`raw_transcript`, `speakers_identified_count`)
- **Enhanced Config Speakers**: `/api/config_speakers` now generates AI summary with updated speaker names
- **AI Summary Storage**: Stores comprehensive meeting summary in `transcript_ai_summary` column
- **Improved Error Handling**: Better fallback handling for audio processing failures

## Features

- **Frontend-Initiated Transcription**: Manual control over transcription timing (automatic mode disabled)
- **Multi-language Transcription**: Automatic language detection with support for multiple languages
- **Smart Speaker Detection**: Intelligent speaker identification with configurable labeling
- **Database Integration**: Save and update transcripts in Supabase
- **Live Updates**: Server-Sent Events (SSE) for real-time transcript streaming
- **Long Meeting Support**: Handles meetings up to 8-10 hours with chunked processing
- **Export Formats**: Download transcripts as TXT, JSON, or SRT files
- **Health Monitoring**: Comprehensive health checks and service status endpoints
- **Docker Ready**: Containerized deployment with health checks
- **Event ID Based Access**: Use Google Meet event IDs instead of bot IDs
- **Service Resilience**: Automatic recovery when external APIs become unavailable
- **Transcription Delay**: Configurable delay before starting transcription (default 30s)

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Meeting Bot    │────▶│ Live Transcript  │────▶│  Client Apps    │
│     API         │     │    Service       │     │  (Frontend)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  Google Gemini   │
                        │      API         │
                        └──────────────────┘
```

## Prerequisites

- Node.js 18+ 
- Google Gemini API key
- Access to Meeting Bot API

## Installation

### Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd live-transcript-service
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Run the service:
```bash
npm run dev  # Development with hot reload
npm start    # Production mode
```

### Docker Development

```bash
# Build and run with Docker Compose
docker-compose -f docker-compose.dev.yml up

# Or build manually
docker build -f Dockerfile.dev -t live-transcript-service:dev .
docker run -p 3003:3003 --env-file .env live-transcript-service:dev
```

### Production Deployment

```bash
# Using Docker Compose
docker-compose up -d

# Or build for production
docker build -t live-transcript-service:latest .
docker run -d -p 3003:3003 --env-file .env live-transcript-service:latest
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3003 |
| `NODE_ENV` | Environment (development/production) | development |
| `SERVICE_NAME` | Service identifier | live-transcript-service |
| `MEETING_BOT_API_URL` | Meeting Bot API base URL | Required |
| `MEETING_BOT_API_KEY` | Meeting Bot API key | Optional |
| `GOOGLE_GEMINI_API_KEY` | Google Gemini API key | Required |
| `GOOGLE_GEMINI_MODEL` | Gemini model to use | gemini-1.5-flash |
| `AUDIO_FETCH_INTERVAL` | Audio polling interval (ms) | 5000 |
| `AUDIO_BUFFER_SIZE` | Audio buffer size (seconds) | 30 |
| `TRANSCRIPTION_START_DELAY` | Delay before starting transcription (seconds) | 30 |
| `ENABLE_SPEAKER_DIARIZATION` | Enable speaker identification | true |
| `TRANSCRIPT_LANGUAGE` | Language mode (auto/specific) | auto |
| `TRANSCRIPT_LANGUAGE_HINTS` | Supported languages | en,de,es,fr,it,pt,nl,pl |

## API Endpoints

### Health & Status

#### GET /health
Health check endpoint for monitoring service health.

```json
{
  "status": "healthy",
  "timestamp": "2025-01-23T10:00:00Z",
  "uptime": 3600,
  "checks": {
    "service": "healthy",
    "meetingBotAPI": "healthy",
    "geminiAPI": "configured",
    "memory": "healthy"
  }
}
```

#### GET /api/status
Service status and statistics.

```json
{
  "status": "operational",
  "activeSessions": 2,
  "totalTranscriptions": 156,
  "version": "1.0.0"
}
```

### Transcript Management

#### GET /api/transcript-sessions
List all active transcription sessions with event IDs.

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
      "duration": 1234,
      "wordCount": 4567,
      "detectedLanguage": "en",
      "hasAiSummary": true
    }
  ]
}
```

#### GET /api/live-transcript/:eventId or /api/enhanced-transcripts/:eventId
Get full transcript with AI summary for a specific event ID.

```json
{
  "success": true,
  "sessionId": "bot_1_transcript",
  "transcript": {
    "segments": [
      {
        "speaker": "Speaker 1",
        "text": "Hello everyone",
        "timestamp": "00:00:05",
        "startTimestamp": "00:00:05",
        "endTimestamp": "00:00:08",
        "startTime": 5.0,
        "endTime": 8.5,
        "confidence": 0.95
      }
    ],
    "fullText": "Full transcript text...",
    "wordCount": 456,
    "detectedLanguage": "en"
  }
}
```

#### GET /api/transcripts/:sessionId/live
Server-Sent Events endpoint for real-time updates.

```
event: transcript_update
data: {"speaker":"Speaker 1","text":"Hello","startTime":5.0}

event: speaker_change  
data: {"previousSpeaker":"Speaker 1","currentSpeaker":"Speaker 2"}
```

#### POST /api/transcripts/:sessionId/stop
Stop transcription for a session.

#### GET /api/transcripts/:sessionId/download
Download transcript in various formats.
- Query params: `format=txt|json|srt`

### Frontend Transcription Endpoints

These endpoints allow frontend to directly request transcriptions with consistent input format:

- `POST /api/transcribe` - Transcribe audio and get both raw transcript and AI summary (uses participant names)
- `POST /api/transcribe/raw` - Get only raw transcript with generic speaker labels (Speaker 1, Speaker 2, etc.)
- `POST /api/transcribe/summary` - Get only AI summary (uses participant names internally)
- `POST /api/transcribe/raw_save` - Transcribe and save to Supabase database (for Meeting Bot team) - supports MP3 format
- `POST /api/config_speakers` - Replace generic speaker labels with participant names and generate AI summary

All transcribe endpoints accept the same request format with audio URL and participants list.

See [Frontend Transcribe API Documentation](docs/frontend-transcribe-api.md) for detailed usage.

### Debug Endpoints

These endpoints are available for debugging and development:

- `GET /api/debug/bot-pool` - Check current bot pool status
- `GET /api/debug/transcript-sessions` - View all active transcript sessions
- `POST /api/debug/force-poll` - Force immediate bot pool polling
- `POST /api/debug/force-transcribe` - Force immediate audio processing
- `GET /api/test/transcription/:botId` - Test transcription for a specific bot

## Service Architecture

### Core Services

1. **BotPoolMonitor**: Polls Meeting Bot API for active bots
2. **AudioFetchService**: Fetches and manages audio buffers
3. **GeminiTranscriptionService**: Handles audio transcription via Gemini API
4. **TranscriptStreamService**: Manages transcript sessions and real-time updates

### Audio Processing Flow

1. BotPoolMonitor identifies active bots in meetings
2. AudioFetchService fetches audio incrementally
3. Audio is processed and converted to Gemini-compatible format
4. GeminiTranscriptionService transcribes audio with language detection
5. TranscriptStreamService updates sessions and notifies SSE clients

## Development

### Running Tests
```bash
npm test          # Run tests
npm run test:watch # Run tests in watch mode
```

### Linting
```bash
npm run lint      # Check code style
npm run lint:fix  # Fix code style issues
```

### Project Structure
```
live-transcript-service/
├── src/
│   ├── api/
│   │   ├── routes/       # API endpoints
│   │   └── server.js     # Express server setup
│   ├── services/         # Core business logic
│   ├── utils/            # Helper utilities
│   └── index.js          # Entry point
├── logs/                 # Application logs
├── Dockerfile            # Production container
├── docker-compose.yml    # Production compose
└── package.json          # Dependencies
```

## Deployment

### Coolify Deployment

1. Push code to Git repository
2. In Coolify:
   - Create new application
   - Select Git repository
   - Use Dockerfile build pack
   - Configure environment variables
   - Enable health checks
   - Deploy

### Manual Docker Deployment

```bash
# Build image
docker build -t live-transcript-service:latest .

# Run container
docker run -d \
  --name live-transcript-service \
  -p 3003:3003 \
  --env-file .env \
  --restart unless-stopped \
  live-transcript-service:latest
```

## Monitoring

### Logs
- Development: Console output with colors
- Production: JSON logs in `/app/logs/`

### Metrics
- Available at `/api/status/metrics`
- Tracks transcription performance, memory usage, active sessions

### Health Checks
- Liveness: `/health/live`
- Readiness: `/health/ready`
- Full health: `/health`

## Troubleshooting

### Common Issues

1. **Audio fetch failures**
   - Check Meeting Bot API connectivity
   - Verify bot is in meeting status
   - Check network timeouts

2. **Transcription errors**
   - Verify Gemini API key
   - Check rate limits
   - Monitor audio quality

3. **Memory issues**
   - Adjust `AUDIO_BUFFER_SIZE`
   - Monitor long-running sessions
   - Check for memory leaks

### Debug Mode
Set `LOG_LEVEL=debug` in environment for verbose logging.

## Security

- API keys stored in environment variables
- CORS configured for production domains
- Rate limiting on API endpoints
- Non-root Docker user
- Input validation on all endpoints

## Future Enhancements

- Database integration for transcript persistence
- User authentication and access control
- Transcript search functionality
- WebSocket support alongside SSE
- Recording playback with synchronized transcript
- Advanced analytics and insights

## License

ISC License

## Support

For issues and questions:
- Check logs at `/api/status`
- Monitor health at `/health`
- Review metrics at `/api/status/metrics`