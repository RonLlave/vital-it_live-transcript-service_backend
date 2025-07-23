# Frontend Integration Guide for Live Transcript Service

## Overview

This guide provides instructions for frontend developers to integrate with the Live Transcript Service API to display real-time transcripts, AI summaries, and meeting metadata in a modal/window interface.

## Primary Endpoint

### GET `/api/enhanced-transcripts/:sessionId`

This single endpoint provides everything needed for the frontend:
- Raw transcript segments
- AI-generated summary
- Meeting metadata (event ID, participants, etc.)
- Bot information
- Timestamps and status

## API Response Structure

```json
{
  "success": true,
  "sessionId": "bot_1_transcript",
  "event_id": "meet_event_12345",  // Google Meet event ID
  "meetingInfo": {
    "title": "Weekly Team Standup",
    "url": "https://meet.google.com/abc-defg-hij",
    "organizer": "john.doe@company.com",
    "scheduledStartTime": "2025-01-23T10:00:00Z",
    "scheduledEndTime": "2025-01-23T11:00:00Z",
    "actualStartTime": "2025-01-23T10:02:00Z",
    "lastUpdated": "2025-01-23T10:45:00Z",
    "duration": 2580,  // seconds
    "durationFormatted": "00:43:00",
    "status": "active",  // or "stopped"
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
      },
      // ... more segments
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
        "Sprint planning scheduled for Friday",
        "New team member onboarding next week"
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
        },
        {
          "task": "Prepare sprint planning materials",
          "assignee": "Jane Smith",
          "deadline": "2025-01-25"
        }
      ],
      "topics": ["Project Alpha", "Deployment", "Sprint Planning", "Onboarding"],
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

## Frontend Implementation Guide

### 1. Modal/Window Component Structure

```javascript
// Example React component structure
const LiveTranscriptModal = ({ sessionId, isOpen, onClose }) => {
  const [transcriptData, setTranscriptData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Fetch initial data when modal opens
  useEffect(() => {
    if (isOpen && sessionId) {
      fetchTranscriptData();
      const refreshInterval = setInterval(fetchTranscriptData, 5000); // Refresh every 5 seconds
      
      return () => clearInterval(refreshInterval);
    }
  }, [isOpen, sessionId]);

  const fetchTranscriptData = async () => {
    try {
      const response = await fetch(
        `https://live-transcript-service-backend.dev.singularity-works.com/api/enhanced-transcripts/${sessionId}`
      );
      const data = await response.json();
      
      if (data.success) {
        setTranscriptData(data);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load transcript');
    } finally {
      setLoading(false);
    }
  };

  // Component sections
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader meetingInfo={transcriptData?.meetingInfo} />
      <ModalTabs>
        <Tab label="Live Transcript">
          <TranscriptView segments={transcriptData?.transcript.segments} />
        </Tab>
        <Tab label="AI Summary">
          <SummaryView summary={transcriptData?.aiSummary} />
        </Tab>
        <Tab label="Participants">
          <ParticipantsView participants={transcriptData?.participants} />
        </Tab>
      </ModalTabs>
    </Modal>
  );
};
```

### 2. Real-time Updates with SSE

```javascript
// Connect to Server-Sent Events for real-time updates
const connectToLiveStream = (sessionId) => {
  const eventSource = new EventSource(
    `https://live-transcript-service-backend.dev.singularity-works.com/api/enhanced-transcripts/${sessionId}/live`
  );

  eventSource.addEventListener('transcript_update', (event) => {
    const update = JSON.parse(event.data);
    // Add new transcript segment to the view
    addTranscriptSegment(update);
  });

  eventSource.addEventListener('summary_update', (event) => {
    const update = JSON.parse(event.data);
    // Update AI summary section
    updateSummary(update.summary);
  });

  eventSource.addEventListener('session_stopped', (event) => {
    // Handle meeting end
    eventSource.close();
    showMeetingEndedNotification();
  });

  return eventSource;
};
```

### 3. Display Components

#### Transcript View
```javascript
const TranscriptView = ({ segments, autoScroll }) => {
  const transcriptRef = useRef(null);

  useEffect(() => {
    if (autoScroll && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [segments]);

  return (
    <div ref={transcriptRef} className="transcript-container">
      {segments?.map((segment) => (
        <TranscriptSegment key={segment.id} segment={segment} />
      ))}
    </div>
  );
};

const TranscriptSegment = ({ segment }) => (
  <div className="transcript-segment">
    <div className="segment-header">
      <span className="speaker">{segment.speaker}</span>
      <span className="timestamp">{formatTime(segment.startTime)}</span>
    </div>
    <div className="segment-text">{segment.text}</div>
  </div>
);
```

#### Summary View
```javascript
const SummaryView = ({ summary }) => {
  if (!summary) return <LoadingSkeleton />;

  return (
    <div className="summary-container">
      <section className="brief">
        <h3>Meeting Summary</h3>
        <p>{summary.summary.brief}</p>
      </section>

      <section className="key-points">
        <h3>Key Points</h3>
        <ul>
          {summary.summary.keyPoints.map((point, idx) => (
            <li key={idx}>{point}</li>
          ))}
        </ul>
      </section>

      <section className="action-items">
        <h3>Action Items</h3>
        {summary.summary.actionItems.map((item, idx) => (
          <ActionItem key={idx} item={item} />
        ))}
      </section>

      <section className="insights">
        <h3>Meeting Insights</h3>
        <ParticipationChart data={summary.insights.participationRate} />
        <div className="meeting-effectiveness">
          Effectiveness: {summary.insights.effectiveness}
        </div>
      </section>
    </div>
  );
};
```

### 4. Styling Recommendations

```css
/* Modal container */
.transcript-modal {
  width: 90%;
  max-width: 1200px;
  height: 80vh;
  display: flex;
  flex-direction: column;
}

/* Split view for transcript and summary */
.modal-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  height: 100%;
}

/* Transcript styling */
.transcript-container {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  background: #f5f5f5;
}

.transcript-segment {
  margin-bottom: 16px;
  padding: 12px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.segment-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
}

.speaker {
  font-weight: 600;
  color: #2563eb;
}

.timestamp {
  color: #6b7280;
}

/* Summary styling */
.summary-container {
  padding: 20px;
  overflow-y: auto;
}

.summary-container section {
  margin-bottom: 24px;
}

.action-item {
  padding: 12px;
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  margin-bottom: 8px;
}
```

### 5. Error Handling

```javascript
const ErrorBoundary = ({ error, retry }) => (
  <div className="error-container">
    <h3>Unable to load transcript</h3>
    <p>{error?.message || 'An unexpected error occurred'}</p>
    <button onClick={retry}>Retry</button>
  </div>
);
```

### 6. Performance Optimizations

```javascript
// Virtualize long transcripts
import { VariableSizeList } from 'react-window';

const VirtualizedTranscript = ({ segments }) => {
  const getItemSize = (index) => {
    // Calculate height based on text length
    const text = segments[index].text;
    return 60 + Math.ceil(text.length / 80) * 20;
  };

  return (
    <VariableSizeList
      height={600}
      itemCount={segments.length}
      itemSize={getItemSize}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <TranscriptSegment segment={segments[index]} />
        </div>
      )}
    </VariableSizeList>
  );
};
```

## Integration Steps

1. **Get Session ID**: Obtain the session ID from the Meeting Bot integration
2. **Open Modal**: When user clicks "View Transcript" button
3. **Fetch Data**: Call the enhanced transcript endpoint
4. **Display Data**: Render transcript, summary, and metadata
5. **Connect SSE**: Establish real-time connection for updates
6. **Handle Updates**: Update UI as new segments arrive
7. **Clean Up**: Close SSE connection when modal closes

## Example Usage

```javascript
// In your meeting interface
const MeetingInterface = ({ meetingId }) => {
  const [sessionId, setSessionId] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);

  // Get session ID from your meeting bot integration
  useEffect(() => {
    // This would come from your Meeting Bot API
    const botSessionId = `bot_${meetingId}_transcript`;
    setSessionId(botSessionId);
  }, [meetingId]);

  return (
    <div>
      <button onClick={() => setShowTranscript(true)}>
        View Live Transcript
      </button>
      
      {showTranscript && (
        <LiveTranscriptModal
          sessionId={sessionId}
          isOpen={showTranscript}
          onClose={() => setShowTranscript(false)}
        />
      )}
    </div>
  );
};
```

## API Features

- **Single Endpoint**: Everything in one API call
- **Real-time Updates**: SSE for live transcript segments
- **AI Summary**: Automatically generated and updated
- **Multi-language**: Supports multiple languages with auto-detection
- **Speaker Labels**: Identified speakers throughout the meeting
- **Participant Info**: Full participant list with roles
- **Meeting Metadata**: Event ID, organizer, times, etc.

## Best Practices

1. **Polling vs SSE**: Use SSE for real-time updates, poll the main endpoint every 30-60 seconds for summary updates
2. **Error Recovery**: Implement retry logic for failed requests
3. **Performance**: Virtualize long transcripts, lazy load summary sections
4. **Accessibility**: Include ARIA labels, keyboard navigation
5. **Responsive**: Ensure modal works on different screen sizes

## Support

For issues or questions about the API:
- Check API health: https://live-transcript-service-backend.dev.singularity-works.com/health
- API documentation: See API_ENDPOINTS.md
- Test your session ID: https://live-transcript-service-backend.dev.singularity-works.com/api/enhanced-transcripts/{sessionId}