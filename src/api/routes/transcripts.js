const express = require('express');
const router = express.Router();
const { asyncHandler, NotFoundError, ValidationError } = require('../../utils/ErrorHandler');
const Logger = require('../../utils/Logger');
const TranscriptStreamService = require('../../services/TranscriptStreamService');

/**
 * Get all active transcription sessions
 * GET /api/transcripts/active
 */
router.get('/active', asyncHandler(async (req, res) => {
  const sessions = TranscriptStreamService.getActiveSessions();
  
  res.json({
    success: true,
    count: sessions.length,
    sessions: sessions
  });
}));

/**
 * Get full transcript for a specific session
 * GET /api/transcripts/:sessionId
 */
router.get('/:sessionId', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessionId) {
    throw new ValidationError('Session ID is required', 'sessionId');
  }

  const transcript = TranscriptStreamService.getTranscript(sessionId);
  
  res.json({
    success: true,
    sessionId: transcript.sessionId,
    botId: transcript.botId,
    meetingUrl: transcript.meetingUrl,
    transcript: transcript.transcript,
    metadata: transcript.metadata
  });
}));

/**
 * Server-Sent Events endpoint for real-time transcript updates
 * GET /api/transcripts/:sessionId/live
 */
router.get('/:sessionId/live', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessionId) {
    throw new ValidationError('Session ID is required', 'sessionId');
  }

  // Verify session exists
  try {
    TranscriptStreamService.getTranscript(sessionId);
  } catch (error) {
    if (error.statusCode === 404) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      });
      return;
    }
    throw error;
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial connection event
  res.write('event: connected\ndata: {"message":"Connected to transcript stream"}\n\n');

  // Add client to SSE clients
  TranscriptStreamService.addSSEClient(sessionId, res);

  // Handle client disconnect
  req.on('close', () => {
    TranscriptStreamService.removeSSEClient(sessionId, res);
    Logger.debug(`SSE client disconnected from session ${sessionId}`);
  });

  // Keep connection alive with periodic pings
  const pingInterval = setInterval(() => {
    try {
      res.write('event: ping\ndata: {"timestamp":"' + new Date().toISOString() + '"}\n\n');
    } catch (error) {
      clearInterval(pingInterval);
    }
  }, 30000); // Every 30 seconds

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(pingInterval);
  });
}));

/**
 * Stop transcription for a specific session
 * POST /api/transcripts/:sessionId/stop
 */
router.post('/:sessionId/stop', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessionId) {
    throw new ValidationError('Session ID is required', 'sessionId');
  }

  TranscriptStreamService.stopSession(sessionId);
  
  Logger.info(`Transcript session ${sessionId} stopped via API`);
  
  res.json({
    success: true,
    message: `Transcription stopped for session ${sessionId}`,
    sessionId
  });
}));

/**
 * Get transcript statistics
 * GET /api/transcripts/stats
 */
router.get('/stats/summary', asyncHandler(async (req, res) => {
  const stats = TranscriptStreamService.getStats();
  const sessions = TranscriptStreamService.getActiveSessions();
  
  const languageDistribution = {};
  sessions.forEach(session => {
    const lang = session.detectedLanguage || 'unknown';
    languageDistribution[lang] = (languageDistribution[lang] || 0) + 1;
  });

  res.json({
    success: true,
    stats: {
      totalSessions: stats.totalSessions,
      activeSessions: stats.activeSessions,
      totalSegments: stats.totalSegments,
      totalWords: stats.totalWords,
      averageWordsPerSession: stats.totalSessions > 0 ? 
        Math.round(stats.totalWords / stats.totalSessions) : 0,
      languageDistribution,
      transcriptionPerformance: stats.transcriptionStats
    }
  });
}));

/**
 * Download transcript as text file
 * GET /api/transcripts/:sessionId/download
 */
router.get('/:sessionId/download', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const format = req.query.format || 'txt';
  
  if (!sessionId) {
    throw new ValidationError('Session ID is required', 'sessionId');
  }

  if (!['txt', 'json', 'srt'].includes(format)) {
    throw new ValidationError('Invalid format. Supported formats: txt, json, srt', 'format');
  }

  const transcript = TranscriptStreamService.getTranscript(sessionId);
  
  let content;
  let contentType;
  let filename;

  switch (format) {
    case 'txt':
      content = formatTranscriptAsText(transcript);
      contentType = 'text/plain';
      filename = `transcript_${sessionId}.txt`;
      break;
    
    case 'json':
      content = JSON.stringify(transcript, null, 2);
      contentType = 'application/json';
      filename = `transcript_${sessionId}.json`;
      break;
    
    case 'srt':
      content = formatTranscriptAsSRT(transcript);
      contentType = 'text/plain';
      filename = `transcript_${sessionId}.srt`;
      break;
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
}));

/**
 * Format transcript as plain text
 * @param {Object} transcript - Transcript data
 * @returns {string} Formatted text
 */
function formatTranscriptAsText(transcript) {
  const header = [
    `Transcript for Meeting: ${transcript.meetingUrl}`,
    `Session ID: ${transcript.sessionId}`,
    `Started: ${transcript.metadata.startedAt}`,
    `Duration: ${transcript.metadata.durationFormatted}`,
    `Language: ${transcript.transcript.detectedLanguage}`,
    `Speakers: ${transcript.transcript.speakers.join(', ')}`,
    `Word Count: ${transcript.transcript.wordCount}`,
    '='.repeat(80),
    ''
  ].join('\n');

  const segments = transcript.transcript.segments.map(segment => {
    const timestamp = formatTimestamp(segment.startTime);
    return `[${timestamp}] ${segment.speaker}: ${segment.text}`;
  }).join('\n\n');

  return header + segments;
}

/**
 * Format transcript as SRT subtitle file
 * @param {Object} transcript - Transcript data
 * @returns {string} SRT formatted content
 */
function formatTranscriptAsSRT(transcript) {
  return transcript.transcript.segments.map((segment, index) => {
    const startTime = formatSRTTime(segment.startTime);
    const endTime = formatSRTTime(segment.endTime);
    
    return [
      index + 1,
      `${startTime} --> ${endTime}`,
      `${segment.speaker}: ${segment.text}`,
      ''
    ].join('\n');
  }).join('\n');
}

/**
 * Format timestamp in seconds to HH:MM:SS
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time
 */
function formatTimestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return [hours, minutes, secs]
    .map(v => v.toString().padStart(2, '0'))
    .join(':');
}

/**
 * Format time for SRT format (HH:MM:SS,mmm)
 * @param {number} seconds - Time in seconds
 * @returns {string} SRT formatted time
 */
function formatSRTTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
}

module.exports = router;