# CLAUDE.md - Live Transcript Service Development Guidelines

This document provides guidelines for AI assistants (Claude or similar) working on the Live Transcript Service project.

## Project Context

This is a Node.js backend service that:
- Consumes audio streams from Meeting Bot API
- Transcribes audio using Google Gemini API
- Provides real-time transcripts via REST API and SSE
- Supports multi-language transcription with speaker diarization
- Handles long-duration meetings (8+ hours)

## Key Technical Decisions

### Architecture
- **Microservices Pattern**: Separate services for bot monitoring, audio fetching, transcription, and streaming
- **Event-Driven**: Services communicate through events and callbacks
- **Polling-Based**: Audio fetching uses polling instead of webhooks for simplicity
- **In-Memory Storage**: Transcripts stored in memory (database integration planned for future)

### Technology Stack
- **Runtime**: Node.js 18+ with ES6+ features
- **Framework**: Express.js for REST API
- **Audio Processing**: fluent-ffmpeg for audio manipulation
- **AI/ML**: Google Gemini API for transcription
- **Real-time**: Server-Sent Events (SSE) for live updates
- **Containerization**: Docker with Alpine Linux for small image size

## Code Standards

### File Structure
```
src/
├── api/          # API layer (routes, server setup)
├── services/     # Business logic services
├── utils/        # Shared utilities
└── index.js      # Application entry point
```

### Naming Conventions
- **Files**: PascalCase for classes (e.g., `AudioProcessor.js`), camelCase for others
- **Variables**: camelCase for variables and functions
- **Constants**: UPPER_SNAKE_CASE for environment variables and constants
- **Classes**: PascalCase for class names

### Error Handling
- Use custom error classes from `ErrorHandler.js`
- Always use `asyncHandler` wrapper for async route handlers
- Implement retry logic for external API calls
- Log errors with context using the Logger utility

### Logging
- Use the Logger utility for all console output
- Log levels: error, warn, info, debug, metric
- Include contextual information in log entries
- Use structured logging (JSON format in production)

## Service Guidelines

### BotPoolMonitor
- Polls Meeting Bot API at configurable intervals
- Manages bot lifecycle tracking
- Emits events for bot status changes
- Handles API failures gracefully with exponential backoff

### AudioFetchService
- Fetches audio incrementally to avoid re-processing
- Uses fingerprinting for deduplication
- Manages memory efficiently with buffer limits
- Cleans up old buffers periodically

### GeminiTranscriptionService
- Handles rate limiting and quota management
- Supports chunked processing for long audio
- Implements language detection with fallbacks
- Formats responses consistently

### TranscriptStreamService
- Manages transcript sessions and SSE connections
- Handles real-time updates efficiently
- Provides multiple export formats
- Cleans up completed sessions

## API Design Principles

1. **RESTful Design**: Use proper HTTP methods and status codes
2. **Consistent Response Format**: All responses include `success` field
3. **Error Responses**: Structured error objects with type and message
4. **Pagination Ready**: Design APIs to support future pagination
5. **Version Ready**: Structure allows for future API versioning

## Testing Guidelines

### Unit Tests
- Test individual service methods
- Mock external dependencies
- Focus on edge cases and error scenarios
- Aim for 80%+ code coverage

### Integration Tests
- Test API endpoints end-to-end
- Use supertest for HTTP testing
- Test error scenarios and validations
- Verify SSE functionality

### Test Data
- Use realistic audio samples for testing
- Create mock Meeting Bot API responses
- Test with multiple languages and speakers

## Performance Considerations

1. **Memory Management**
   - Monitor heap usage
   - Implement buffer size limits
   - Clean up old sessions and buffers
   - Use streams for large data

2. **API Optimization**
   - Implement request caching where appropriate
   - Use connection pooling
   - Batch API requests when possible
   - Implement circuit breakers for external APIs

3. **Scalability**
   - Design for horizontal scaling
   - Minimize shared state
   - Use environment variables for configuration
   - Implement graceful shutdown

## Security Best Practices

1. **API Keys**: Always use environment variables
2. **Input Validation**: Validate all user inputs
3. **Rate Limiting**: Implement on all public endpoints
4. **CORS**: Configure appropriately for production
5. **Dependencies**: Regular security audits with npm audit

## Deployment Notes

### Environment Configuration
```bash
# Required environment variables
MEETING_BOT_API_URL=https://meeting-bot-backend.dev.singularity-works.com
GOOGLE_GEMINI_API_KEY=your-key-here

# Recommended for production
NODE_ENV=production
ENABLE_METRICS=true
LOG_LEVEL=info
```

### Docker Best Practices
- Use multi-stage builds for smaller images
- Run as non-root user
- Include health checks
- Use .dockerignore to exclude unnecessary files

### Monitoring
- Check `/health` endpoint regularly
- Monitor `/api/status` for service metrics
- Watch memory usage trends
- Track API response times

## Common Tasks

### Adding a New Endpoint
1. Create route in `src/api/routes/`
2. Add business logic in appropriate service
3. Update API documentation in README.md
4. Add tests for the endpoint
5. Test error scenarios

### Updating Dependencies
```bash
npm update           # Update to latest minor versions
npm audit fix       # Fix security vulnerabilities
npm run test        # Verify nothing breaks
```

### Debugging Issues
1. Check logs (set `LOG_LEVEL=debug`)
2. Monitor `/api/status` endpoint
3. Verify external API connectivity
4. Check memory usage and active sessions
5. Review error patterns in logs

### Performance Optimization
1. Profile with Node.js built-in profiler
2. Monitor memory leaks with heap snapshots
3. Optimize database queries (when added)
4. Implement caching strategies
5. Review and optimize audio processing

## Future Enhancements

### Planned Features
1. **Database Integration**: PostgreSQL/Supabase for persistence
2. **Authentication**: JWT-based auth system
3. **WebSocket Support**: Alongside existing SSE
4. **Transcript Search**: Full-text search capabilities
5. **Analytics Dashboard**: Meeting insights and statistics

### Architecture Evolution
1. **Message Queue**: For async processing
2. **Caching Layer**: Redis for performance
3. **CDN Integration**: For static assets
4. **Microservices Split**: Separate transcription service

## Operating Mode

### Frontend-Initiated Transcription (Current Mode)
The service currently operates in frontend-initiated mode only:
- Automatic bot pool monitoring is **DISABLED**
- Automatic audio fetching is **DISABLED**
- Frontend makes POST requests to `/api/transcribe/*` endpoints
- Frontend provides audio URLs and participant lists
- No automatic session creation or polling

To re-enable automatic mode, uncomment the disabled code in:
- `src/index.js` - Service initialization
- `src/services/TranscriptStreamService.js` - Bot pool subscription

## Recent Updates (July 2025)

### Service Resilience
- Added `ServiceMonitor` utility for tracking external service health
- Service now recovers automatically when Meeting Bot API becomes unavailable
- Enhanced error handling prevents crashes during API downtime

### API Changes
- **Event ID Based Access**: Endpoints now use event IDs instead of bot IDs
- **New Endpoint**: `/api/transcript-sessions` lists all active sessions
- **Enhanced Response**: Sessions include complete `live_transcript_url`
- **Formatted Timestamps**: Segments now include HH:mm:ss timestamps

### Configuration
- Added `TRANSCRIPTION_START_DELAY` (default 30s) to avoid premature audio
- Removed FFmpeg dependency for simpler audio validation

### Speaker Identification
- Enhanced Gemini prompt to use direct speaker naming approach
- Added aggressive post-processing to replace generic labels with participant names
- For single participant meetings, all segments use the participant's name
- For multiple participants, fuzzy matching and heuristics are applied

### API Consistency
- All three transcribe endpoints now accept the same input format
- `/api/transcribe/summary` now accepts audio URL instead of segments
- Consistent parameter structure across raw, full, and summary endpoints

## Commands Reference

```bash
# Development
npm run dev         # Start with hot reload
npm test           # Run tests
npm run lint       # Check code style

# Production  
npm start          # Start production server
npm run build      # Build for production (if applicable)

# Docker
docker-compose up -d                    # Start production
docker-compose -f docker-compose.dev.yml up  # Start development
docker-compose logs -f                  # View logs
docker-compose down                     # Stop services

# Monitoring
curl http://localhost:3003/health       # Health check
curl http://localhost:3003/api/status   # Service status

# Debug Operations
curl -X POST http://localhost:3003/api/debug/force-poll        # Force bot pool check
curl -X POST http://localhost:3003/api/debug/force-transcribe  # Force audio processing
```

## Troubleshooting Checklist

1. **Service Won't Start**
   - Check environment variables
   - Verify port 3003 is available
   - Check Docker logs

2. **No Transcriptions**
   - Verify Gemini API key
   - Check Meeting Bot API connectivity
   - Ensure bots are in meetings
   - Review audio fetch logs
   - Check if meeting has been running for at least 30 seconds (TRANSCRIPTION_START_DELAY)

3. **High Memory Usage**
   - Check active session count
   - Review buffer sizes
   - Look for memory leaks
   - Implement cleanup routines

4. **SSE Not Working**
   - Check CORS configuration
   - Verify client connection handling
   - Test with curl for raw SSE
   - Check proxy/firewall settings

## Known Issues and Workarounds

1. **Bot ID Mapping**: Meeting Bot API uses different field names (`id`, `poolBotId`, `legacyBotId`). Always check all fields.
2. **Audio Availability**: Audio may not be immediately available when bot joins. Service handles 425 status gracefully.
3. **Rate Limiting**: Implement exponential backoff for external API calls
4. **Premature Audio**: Audio at the start of meetings can be unstable. Service waits 30 seconds (configurable via `TRANSCRIPTION_START_DELAY`) before starting transcription to ensure audio quality.
5. **Speaker Identification**: Gemini may return generic labels like "Unknown" or "Speaker 1" despite being provided participant names. Service includes aggressive post-processing to replace these with actual participant names. For single participant meetings, all segments are forced to use the participant's name.

## Contact & Support

For architectural decisions or major changes:
1. Review existing patterns in codebase
2. Check this document for guidelines
3. Maintain consistency with current approach
4. Document significant changes

Remember: This service is designed for production use with real-time requirements. Always consider performance, reliability, and scalability in your implementations.