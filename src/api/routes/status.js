const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../utils/ErrorHandler');
const Logger = require('../../utils/Logger');
const BotPoolMonitor = require('../../services/BotPoolMonitor');
const AudioFetchService = require('../../services/AudioFetchService');
const TranscriptStreamService = require('../../services/TranscriptStreamService');
const GeminiTranscriptionService = require('../../services/GeminiTranscriptionService');
const packageJson = require('../../../package.json');

/**
 * Service status and statistics endpoint
 * GET /api/status
 */
router.get('/', asyncHandler(async (req, res) => {
  const startTime = Date.now();

  // Get status from all services
  // DISABLED: Automatic services
  // const botPoolStatus = BotPoolMonitor.getStatus();
  // const audioFetchStatus = AudioFetchService.getStatus();
  const transcriptStats = TranscriptStreamService.getStats();
  const geminiStats = GeminiTranscriptionService.getStats();

  // Calculate operational status
  const operationalStatus = determineOperationalStatus({
    botPoolMonitor: false, // Disabled
    audioFetchService: false, // Disabled
    transcriptSessions: transcriptStats.activeSessions >= 0
  });

  const response = {
    success: true,
    status: operationalStatus,
    activeSessions: transcriptStats.activeSessions,
    totalTranscriptions: geminiStats.total,
    geminiApiStatus: process.env.GOOGLE_GEMINI_API_KEY ? 'configured' : 'not_configured',
    botApiStatus: 'disabled',
    uptime: Math.floor(process.uptime()),
    uptimeFormatted: formatUptime(process.uptime()),
    memoryUsage: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
    version: packageJson.version,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    services: {
      botPoolMonitor: {
        status: 'disabled',
        note: 'Automatic monitoring disabled - using frontend-initiated transcription'
      },
      audioFetchService: {
        status: 'disabled',
        note: 'Automatic fetching disabled - using frontend-provided audio URLs'
      },
      transcriptionService: {
        totalRequests: geminiStats.total,
        successful: geminiStats.successful,
        failed: geminiStats.failed,
        successRate: `${(geminiStats.successRate * 100).toFixed(2)}%`,
        averageDuration: `${geminiStats.averageDuration}ms`
      },
      transcriptStreamService: {
        totalSessions: transcriptStats.totalSessions,
        activeSessions: transcriptStats.activeSessions,
        totalSegments: transcriptStats.totalSegments,
        totalWords: transcriptStats.totalWords
      }
    },
    metrics: {
      processingTime: `${Date.now() - startTime}ms`
    }
  };

  Logger.debug('Status endpoint called', {
    status: response.status,
    activeSessions: response.activeSessions
  });

  res.json(response);
}));

/**
 * Detailed metrics endpoint
 * GET /api/status/metrics
 */
router.get('/metrics', asyncHandler(async (req, res) => {
  const transcriptSessions = TranscriptStreamService.getActiveSessions();
  const geminiStats = GeminiTranscriptionService.getStats();

  const metrics = {
    timestamp: new Date().toISOString(),
    transcription: {
      totalRequests: geminiStats.total,
      successfulRequests: geminiStats.successful,
      failedRequests: geminiStats.failed,
      successRate: geminiStats.successRate,
      averageProcessingTime: geminiStats.averageDuration,
      totalProcessingTime: geminiStats.totalDuration
    },
    sessions: {
      active: transcriptSessions.length,
      details: transcriptSessions.map(session => ({
        sessionId: session.sessionId,
        duration: session.durationFormatted,
        wordCount: session.wordCount,
        language: session.detectedLanguage,
        speakers: session.speakerCount
      }))
    },
    system: {
      cpuUsage: process.cpuUsage(),
      memoryUsage: {
        rss: process.memoryUsage().rss,
        heapTotal: process.memoryUsage().heapTotal,
        heapUsed: process.memoryUsage().heapUsed,
        external: process.memoryUsage().external
      }
    }
  };

  res.json(metrics);
}));

/**
 * Service configuration (non-sensitive) endpoint
 * GET /api/status/config
 */
router.get('/config', (req, res) => {
  res.json({
    service: {
      name: process.env.SERVICE_NAME || 'live-transcript-service',
      version: packageJson.version,
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3003
    },
    features: {
      speakerDiarization: process.env.ENABLE_SPEAKER_DIARIZATION === 'true',
      languageDetection: process.env.TRANSCRIPT_LANGUAGE === 'auto',
      supportedLanguages: (process.env.TRANSCRIPT_LANGUAGE_HINTS || 'en').split(','),
      maxTranscriptLength: parseInt(process.env.MAX_TRANSCRIPT_LENGTH) || 500000
    },
    limits: {
      audioFetchInterval: parseInt(process.env.AUDIO_FETCH_INTERVAL) || 5000,
      audioBufferSize: parseInt(process.env.AUDIO_BUFFER_SIZE) || 30
    },
    apis: {
      meetingBotAPI: {
        configured: !!process.env.MEETING_BOT_API_URL,
        url: process.env.MEETING_BOT_API_URL ? new URL(process.env.MEETING_BOT_API_URL).hostname : null
      },
      geminiAPI: {
        configured: !!process.env.GOOGLE_GEMINI_API_KEY,
        model: process.env.GOOGLE_GEMINI_MODEL || 'gemini-1.5-flash'
      }
    }
  });
});

/**
 * Determine operational status based on service states
 * @param {Object} serviceStates - Service states
 * @returns {string} Operational status
 */
function determineOperationalStatus(serviceStates) {
  const allHealthy = Object.values(serviceStates).every(state => state === true);
  const anyHealthy = Object.values(serviceStates).some(state => state === true);

  if (allHealthy) {
    return 'operational';
  } else if (anyHealthy) {
    return 'degraded';
  } else {
    return 'error';
  }
}

/**
 * Format uptime in seconds to human-readable format
 * @param {number} seconds - Uptime in seconds
 * @returns {string} Formatted uptime
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

module.exports = router;