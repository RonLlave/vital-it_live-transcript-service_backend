const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../utils/ErrorHandler');
const Logger = require('../../utils/Logger');
const TranscriptStreamService = require('../../services/TranscriptStreamService');

/**
 * List all active transcript sessions
 * GET /api/transcript-sessions
 */
router.get('/', asyncHandler(async (req, res) => {
  const sessions = [];
  
  // Get all active sessions
  for (const [sessionId, session] of TranscriptStreamService.transcriptSessions.entries()) {
    sessions.push({
      sessionId,
      event_id: session.metadata?.event_id || null,
      botId: session.botId,
      meetingUrl: session.meetingUrl,
      status: session.status,
      startedAt: session.startedAt,
      lastUpdated: session.lastUpdated,
      duration: session.duration,
      segmentCount: session.segments.length,
      wordCount: session.wordCount,
      speakerCount: session.speakers.size,
      hasAiSummary: !!session.aiSummary,
      participants: session.metadata?.participants?.length || 0,
      detectedLanguage: session.detectedLanguage
    });
  }
  
  // Sort by most recently updated
  sessions.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
  
  res.json({
    success: true,
    count: sessions.length,
    sessions
  });
}));

/**
 * Get transcript session by event ID
 * GET /api/transcript-sessions/event/:eventId
 */
router.get('/event/:eventId', asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  
  // Find session by event_id
  let sessionInfo = null;
  
  for (const [sessionId, session] of TranscriptStreamService.transcriptSessions.entries()) {
    if (session.metadata?.event_id === eventId) {
      sessionInfo = {
        sessionId,
        event_id: session.metadata.event_id,
        botId: session.botId,
        meetingUrl: session.meetingUrl,
        status: session.status,
        startedAt: session.startedAt,
        lastUpdated: session.lastUpdated,
        duration: session.duration,
        segmentCount: session.segments.length,
        wordCount: session.wordCount,
        speakerCount: session.speakers.size,
        hasAiSummary: !!session.aiSummary,
        participants: session.metadata?.participants || [],
        detectedLanguage: session.detectedLanguage
      };
      break;
    }
  }
  
  if (!sessionInfo) {
    return res.status(404).json({
      success: false,
      error: `No active transcript found for event ${eventId}`
    });
  }
  
  res.json({
    success: true,
    session: sessionInfo
  });
}));

module.exports = router;