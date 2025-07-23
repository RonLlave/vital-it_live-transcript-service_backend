const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../utils/ErrorHandler');
const BotPoolMonitor = require('../../services/BotPoolMonitor');
const AudioFetchService = require('../../services/AudioFetchService');
const TranscriptStreamService = require('../../services/TranscriptStreamService');

/**
 * Debug endpoint to check bot pool status
 * GET /api/debug/bot-pool
 */
router.get('/bot-pool', asyncHandler(async (req, res) => {
  const poolStatus = BotPoolMonitor.getStatus();
  const activeBots = BotPoolMonitor.getActiveBots();
  
  res.json({
    success: true,
    pool: poolStatus,
    bots: activeBots.map(bot => ({
      poolBotId: bot.poolBotId || bot.botId,
      legacyBotId: bot.legacyBotId,
      status: bot.status,
      meetingUrl: bot.meetingUrl,
      userEmail: bot.userEmail,
      participants: bot.participants,
      duration: bot.duration,
      durationFormatted: bot.durationFormatted,
      audioBlobUrl: bot.audioBlobUrl,
      fullAudioBlobUrl: bot.fullAudioBlobUrl,
      isNew: bot.isNew,
      lastSeen: bot.lastSeen
    }))
  });
}));

/**
 * Debug endpoint to check audio buffers
 * GET /api/debug/audio-buffers
 */
router.get('/audio-buffers', asyncHandler(async (req, res) => {
  const audioStatus = AudioFetchService.getStatus();
  
  res.json({
    success: true,
    status: audioStatus
  });
}));

/**
 * Debug endpoint to check transcript sessions
 * GET /api/debug/transcript-sessions
 */
router.get('/transcript-sessions', asyncHandler(async (req, res) => {
  const sessions = Array.from(TranscriptStreamService.transcriptSessions.entries()).map(([id, session]) => ({
    sessionId: id,
    botId: session.botId,
    legacyBotId: session.legacyBotId,
    meetingUrl: session.meetingUrl,
    status: session.status,
    segmentCount: session.segments.length,
    wordCount: session.wordCount,
    duration: session.duration,
    hasMetadata: !!session.metadata,
    hasSummary: !!session.aiSummary,
    eventId: session.metadata?.event_id
  }));
  
  res.json({
    success: true,
    count: sessions.length,
    sessions
  });
}));

/**
 * Force poll the bot pool
 * POST /api/debug/force-poll
 */
router.post('/force-poll', asyncHandler(async (req, res) => {
  await BotPoolMonitor.forcePoll();
  
  res.json({
    success: true,
    message: 'Forced bot pool poll completed'
  });
}));

/**
 * Force process audio buffers for transcription
 * POST /api/debug/force-transcribe
 */
router.post('/force-transcribe', asyncHandler(async (req, res) => {
  const { botId } = req.body;
  
  // Force process all audio buffers
  await TranscriptStreamService.processAudioBuffers();
  
  const sessions = Array.from(TranscriptStreamService.transcriptSessions.values());
  const sessionInfo = sessions.map(s => ({
    sessionId: s.sessionId,
    botId: s.botId,
    segments: s.segments.length,
    lastProcessed: s.lastProcessedFingerprint ? 'Yes' : 'No'
  }));
  
  res.json({
    success: true,
    message: 'Forced audio processing completed',
    processedSessions: sessionInfo.length,
    sessions: sessionInfo
  });
}));

module.exports = router;