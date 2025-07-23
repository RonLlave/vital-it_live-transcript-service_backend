const express = require('express');
const router = express.Router();
const { asyncHandler, NotFoundError, ValidationError } = require('../../utils/ErrorHandler');
const Logger = require('../../utils/Logger');
const TranscriptStreamService = require('../../services/TranscriptStreamService');
const { formatDuration } = require('../../utils/formatDuration');
const GeminiTranscriptionService = require('../../services/GeminiTranscriptionService');
const MeetingMetadataService = require('../../services/MeetingMetadataService');

/**
 * Get enhanced transcript with AI summary and meeting metadata
 * GET /api/enhanced-transcripts/:sessionId
 */
router.get('/:sessionId', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { refresh = false } = req.query; // Force refresh AI summary
  
  if (!sessionId) {
    throw new ValidationError('Session ID is required', 'sessionId');
  }

  // Get base transcript
  const session = TranscriptStreamService.transcriptSessions.get(sessionId);
  if (!session) {
    throw new NotFoundError(`Session ${sessionId}`);
  }

  // Fetch meeting metadata if not already cached
  if (!session.metadata || refresh) {
    try {
      session.metadata = await MeetingMetadataService.getMeetingMetadata(
        session.botId, 
        session.legacyBotId
      );
    } catch (error) {
      Logger.error('Failed to fetch meeting metadata:', error);
      session.metadata = {
        error: 'Failed to fetch meeting metadata',
        event_id: null,
        participants: []
      };
    }
  }

  // Generate or update AI summary if needed
  const shouldUpdateSummary = !session.aiSummary || 
    refresh || 
    (Date.now() - (session.lastSummaryUpdate || 0) > session.summaryUpdateInterval);

  if (shouldUpdateSummary && session.segments.length > 0) {
    try {
      const transcript = {
        segments: session.segments,
        fullText: session.segments.map(s => s.text).join(' '),
        wordCount: session.wordCount,
        duration: session.duration,
        detectedLanguage: session.detectedLanguage,
        languageConfidence: session.languageConfidence
      };

      session.aiSummary = await GeminiTranscriptionService.generateSummary(
        transcript,
        {
          participants: session.metadata.participants?.map(p => p.name) || [],
          event_id: session.metadata.event_id,
          meetingTitle: session.metadata.meetingTitle
        }
      );
      session.lastSummaryUpdate = Date.now();
    } catch (error) {
      Logger.error('Failed to generate AI summary:', error);
      session.aiSummary = {
        error: 'Failed to generate summary',
        summary: {
          brief: 'Summary generation failed',
          keyPoints: [],
          decisions: [],
          actionItems: [],
          topics: [],
          sentiment: 'unknown',
          nextSteps: []
        }
      };
    }
  }

  // Build enhanced response
  const enhancedTranscript = {
    success: true,
    sessionId: session.sessionId,
    event_id: session.metadata?.event_id || null,
    meetingInfo: {
      title: session.metadata?.meetingTitle || 'Untitled Meeting',
      url: session.meetingUrl,
      organizer: session.metadata?.organizer || null,
      scheduledStartTime: session.metadata?.scheduledStartTime || null,
      scheduledEndTime: session.metadata?.scheduledEndTime || null,
      actualStartTime: session.startedAt,
      lastUpdated: session.lastUpdated,
      duration: session.duration,
      durationFormatted: session.durationFormatted || formatDuration(session.duration),
      status: session.status,
      recordingEnabled: session.metadata?.recordingEnabled || false
    },
    participants: session.metadata?.participants || [],
    transcript: {
      segments: session.segments,
      fullText: session.segments.map(s => s.text).join(' '),
      wordCount: session.wordCount,
      segmentCount: session.segments.length,
      detectedLanguage: session.detectedLanguage,
      languageConfidence: session.languageConfidence,
      alternativeLanguages: session.alternativeLanguages || [],
      speakers: Array.from(session.speakers),
      lastSegmentTime: session.segments.length > 0 ? 
        session.segments[session.segments.length - 1].endTime : 0
    },
    aiSummary: session.aiSummary || {
      summary: {
        brief: 'Waiting for more content to generate summary...',
        keyPoints: [],
        decisions: [],
        actionItems: [],
        topics: [],
        sentiment: 'neutral',
        nextSteps: []
      },
      insights: {
        participationRate: {},
        mostDiscussedTopics: [],
        meetingType: 'unknown',
        effectiveness: 'unknown'
      },
      metadata: {
        generatedAt: null,
        lastUpdated: session.lastSummaryUpdate
      }
    },
    botInfo: session.metadata?.botInfo || {
      botId: session.botId,
      legacyBotId: session.legacyBotId,
      botName: 'Meeting Bot',
      status: 'active'
    },
    timestamps: {
      sessionStarted: session.startedAt,
      lastTranscriptUpdate: session.lastUpdated,
      lastSummaryUpdate: session.lastSummaryUpdate || null,
      dataFetchedAt: new Date().toISOString()
    }
  };

  res.json(enhancedTranscript);
}));

/**
 * Get all active enhanced transcript sessions
 * GET /api/enhanced-transcripts/active
 */
router.get('/active/list', asyncHandler(async (req, res) => {
  const sessions = TranscriptStreamService.getActiveSessions();
  
  // Enhance each session with basic metadata
  const enhancedSessions = await Promise.all(sessions.map(async (session) => {
    // Try to get cached metadata
    const fullSession = TranscriptStreamService.transcriptSessions.get(session.sessionId);
    
    return {
      ...session,
      event_id: fullSession?.metadata?.event_id || null,
      meetingTitle: fullSession?.metadata?.meetingTitle || 'Untitled Meeting',
      participants: fullSession?.metadata?.participants?.length || 0,
      hasSummary: !!fullSession?.aiSummary,
      lastSummaryUpdate: fullSession?.lastSummaryUpdate || null
    };
  }));

  res.json({
    success: true,
    count: enhancedSessions.length,
    sessions: enhancedSessions
  });
}));

/**
 * Force update AI summary for a session
 * POST /api/enhanced-transcripts/:sessionId/update-summary
 */
router.post('/:sessionId/update-summary', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessionId) {
    throw new ValidationError('Session ID is required', 'sessionId');
  }

  const session = TranscriptStreamService.transcriptSessions.get(sessionId);
  if (!session) {
    throw new NotFoundError(`Session ${sessionId}`);
  }

  if (session.segments.length === 0) {
    throw new ValidationError('No transcript content available for summary generation');
  }

  // Force summary update
  try {
    const transcript = {
      segments: session.segments,
      fullText: session.segments.map(s => s.text).join(' '),
      wordCount: session.wordCount,
      duration: session.duration,
      detectedLanguage: session.detectedLanguage
    };

    // Ensure we have metadata
    if (!session.metadata) {
      session.metadata = await MeetingMetadataService.getMeetingMetadata(
        session.botId,
        session.legacyBotId
      );
    }

    session.aiSummary = await GeminiTranscriptionService.generateSummary(
      transcript,
      {
        participants: session.metadata.participants?.map(p => p.name) || [],
        event_id: session.metadata.event_id,
        meetingTitle: session.metadata.meetingTitle
      }
    );
    session.lastSummaryUpdate = Date.now();

    res.json({
      success: true,
      message: 'AI summary updated successfully',
      sessionId,
      summary: session.aiSummary
    });
  } catch (error) {
    Logger.error('Failed to update AI summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate AI summary',
      details: error.message
    });
  }
}));

/**
 * SSE endpoint for enhanced real-time updates
 * GET /api/enhanced-transcripts/:sessionId/live
 */
router.get('/:sessionId/live', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessionId) {
    throw new ValidationError('Session ID is required', 'sessionId');
  }

  const session = TranscriptStreamService.transcriptSessions.get(sessionId);
  if (!session) {
    res.status(404).json({
      success: false,
      error: 'Session not found'
    });
    return;
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial enhanced data
  const initialData = {
    sessionId,
    event_id: session.metadata?.event_id || null,
    meetingTitle: session.metadata?.meetingTitle || 'Untitled Meeting',
    participants: session.metadata?.participants || [],
    currentDuration: session.duration,
    wordCount: session.wordCount,
    segmentCount: session.segments.length,
    hasSummary: !!session.aiSummary,
    lastSummaryUpdate: session.lastSummaryUpdate
  };

  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify(initialData)}\n\n`);

  // Add enhanced SSE client
  TranscriptStreamService.addSSEClient(sessionId, res);

  // Send summary updates periodically
  const summaryInterval = setInterval(async () => {
    if (session.aiSummary && session.lastSummaryUpdate) {
      res.write(`event: summary_update\n`);
      res.write(`data: ${JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: session.aiSummary.summary,
        lastUpdated: session.lastSummaryUpdate
      })}\n\n`);
    }
  }, 60000); // Every minute

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(summaryInterval);
    TranscriptStreamService.removeSSEClient(sessionId, res);
    Logger.debug(`Enhanced SSE client disconnected from session ${sessionId}`);
  });

  // Keep connection alive
  const pingInterval = setInterval(() => {
    try {
      res.write(`event: ping\n`);
      res.write(`data: ${JSON.stringify({ 
        timestamp: new Date().toISOString(),
        sessionActive: session.status === 'active'
      })}\n\n`);
    } catch (error) {
      clearInterval(pingInterval);
      clearInterval(summaryInterval);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(pingInterval);
  });
}));

module.exports = router;