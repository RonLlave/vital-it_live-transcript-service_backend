const express = require('express');
const router = express.Router();
const axios = require('axios');
const os = require('os');
const { asyncHandler } = require('../../utils/ErrorHandler');
const Logger = require('../../utils/Logger');
const BotPoolMonitor = require('../../services/BotPoolMonitor');
const AudioFetchService = require('../../services/AudioFetchService');
const TranscriptStreamService = require('../../services/TranscriptStreamService');
const ServiceMonitor = require('../../utils/ServiceMonitor');

/**
 * Health check endpoint
 * GET /health
 */
router.get('/', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const healthChecks = {
    service: 'healthy',
    meetingBotAPI: 'unknown',
    geminiAPI: 'unknown',
    memory: 'healthy',
    services: {
      botPoolMonitor: 'unknown',
      audioFetchService: 'unknown',
      transcriptStreamService: 'unknown'
    }
  };

  // Check Meeting Bot API (don't let this crash the health endpoint)
  try {
    const apiUrl = process.env.MEETING_BOT_API_URL;
    const response = await axios.get(`${apiUrl}/health`, {
      timeout: 5000,
      headers: process.env.MEETING_BOT_API_KEY ? {
        'Authorization': `Bearer ${process.env.MEETING_BOT_API_KEY}`
      } : {},
      validateStatus: () => true // Don't throw on any status
    });
    healthChecks.meetingBotAPI = response.status === 200 ? 'healthy' : 'unhealthy';
  } catch (error) {
    healthChecks.meetingBotAPI = 'unhealthy';
    Logger.warn('Meeting Bot API health check failed:', { 
      error: error.message,
      code: error.code 
    });
  }

  // Check Gemini API
  try {
    if (process.env.GOOGLE_GEMINI_API_KEY) {
      // Simple check if API key is configured
      healthChecks.geminiAPI = 'configured';
    } else {
      healthChecks.geminiAPI = 'not_configured';
    }
  } catch (error) {
    healthChecks.geminiAPI = 'error';
  }

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemoryPercent = ((totalMemory - freeMemory) / totalMemory) * 100;
  
  if (usedMemoryPercent > 90) {
    healthChecks.memory = 'critical';
  } else if (usedMemoryPercent > 75) {
    healthChecks.memory = 'warning';
  }

  // Check services status
  const botPoolStatus = BotPoolMonitor.getStatus();
  healthChecks.services.botPoolMonitor = botPoolStatus.isMonitoring ? 'healthy' : 'stopped';

  const audioFetchStatus = AudioFetchService.getStatus();
  healthChecks.services.audioFetchService = audioFetchStatus.isRunning ? 'healthy' : 'stopped';

  const transcriptStats = TranscriptStreamService.getStats();
  healthChecks.services.transcriptStreamService = transcriptStats.activeSessions >= 0 ? 'healthy' : 'error';

  // Add external services status
  const externalServices = ServiceMonitor.getAllStatus();
  healthChecks.externalServices = externalServices;

  // Determine overall health
  const isHealthy = 
    healthChecks.service === 'healthy' &&
    healthChecks.memory !== 'critical' &&
    Object.values(healthChecks.services).every(status => status === 'healthy');

  const response = {
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: healthChecks,
    memory: {
      used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      systemUsedPercent: usedMemoryPercent.toFixed(2) + '%'
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      cpus: os.cpus().length
    },
    responseTime: `${Date.now() - startTime}ms`
  };

  // Log health check
  Logger.debug('Health check performed', {
    status: response.status,
    responseTime: response.responseTime
  });

  res.status(isHealthy ? 200 : 503).json(response);
}));

/**
 * Liveness probe - simple check if service is running
 * GET /health/live
 */
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

/**
 * Readiness probe - check if service is ready to handle requests
 * GET /health/ready
 */
router.get('/ready', asyncHandler(async (req, res) => {
  const botPoolStatus = BotPoolMonitor.getStatus();
  const isReady = botPoolStatus.isMonitoring;

  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    reason: isReady ? null : 'Services not fully initialized'
  });
}));

module.exports = router;