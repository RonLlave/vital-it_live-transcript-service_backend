require('dotenv').config();

const http = require('http');
const Logger = require('./utils/Logger');
const { handleUncaughtExceptions } = require('./utils/ErrorHandler');
const { createServer } = require('./api/server');

// Import services
const BotPoolMonitor = require('./services/BotPoolMonitor');
const AudioFetchService = require('./services/AudioFetchService');
const GeminiTranscriptionService = require('./services/GeminiTranscriptionService');
const TranscriptStreamService = require('./services/TranscriptStreamService');
const MeetingMetadataService = require('./services/MeetingMetadataService');
const SupabaseClient = require('./utils/SupabaseClient');
const ServiceMonitor = require('./utils/ServiceMonitor');

// Handle uncaught exceptions and rejections
handleUncaughtExceptions();

// Configuration
const PORT = process.env.PORT || 3003;
const NODE_ENV = process.env.NODE_ENV || 'development';
const SERVICE_NAME = process.env.SERVICE_NAME || 'live-transcript-service';

/**
 * Initialize all services
 */
async function initializeServices() {
  try {
    Logger.info('Initializing services...');

    // Initialize Gemini API
    GeminiTranscriptionService.initialize();
    Logger.info('✓ Gemini Transcription Service initialized');
    
    // Initialize Supabase (optional)
    const supabaseInitialized = SupabaseClient.initialize();
    if (supabaseInitialized) {
      Logger.info('✓ Supabase client initialized');
    } else {
      Logger.warn('⚠ Supabase client not configured or failed to initialize');
    }

    // Initialize Meeting Metadata Service
    MeetingMetadataService.initialize();
    Logger.info('✓ Meeting Metadata Service initialized');
    
    // Initialize Transcript Stream Service
    await TranscriptStreamService.initialize();
    Logger.info('✓ Transcript Stream Service initialized');

    // DISABLED: Automatic transcription functionality
    // The following services are disabled but code is preserved
    // Frontend will handle transcription requests via POST endpoints
    
    // // Initialize Audio Fetch Service
    // await AudioFetchService.initialize();
    // Logger.info('✓ Audio Fetch Service initialized');

    // // Wait for Meeting Bot API to be available before starting monitors
    // await waitForMeetingBotAPI();

    // // Start Bot Pool Monitor
    // BotPoolMonitor.start();
    // Logger.info('✓ Bot Pool Monitor started');

    // // Initialize Service Monitor
    // initializeServiceMonitor();
    // Logger.info('✓ Service Monitor started');
    
    Logger.info('Automatic transcription disabled - using frontend-initiated transcription only');

    Logger.info('All services initialized successfully');
  } catch (error) {
    Logger.error('Failed to initialize services:', error);
    throw error;
  }
}

/**
 * Wait for Meeting Bot API to be available
 */
async function waitForMeetingBotAPI() {
  const axios = require('axios');
  const apiUrl = process.env.MEETING_BOT_API_URL;
  const maxRetries = 10;
  const retryDelay = 5000; // 5 seconds

  for (let i = 0; i < maxRetries; i++) {
    try {
      Logger.info(`Checking Meeting Bot API availability (attempt ${i + 1}/${maxRetries})...`);
      const response = await axios.get(`${apiUrl}/health`, {
        timeout: 5000,
        validateStatus: () => true
      });
      
      if (response.status === 200) {
        Logger.info('✓ Meeting Bot API is available');
        return;
      } else {
        Logger.warn(`Meeting Bot API returned status ${response.status}`);
      }
    } catch (error) {
      Logger.warn(`Meeting Bot API not available: ${error.message}`);
    }

    if (i < maxRetries - 1) {
      Logger.info(`Waiting ${retryDelay / 1000} seconds before retry...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  // Continue anyway after max retries
  Logger.warn('Meeting Bot API not available after maximum retries, continuing anyway...');
}

/**
 * Start the HTTP server
 */
async function startServer() {
  try {
    // Initialize services first
    await initializeServices();

    // Create Express app
    const app = createServer();

    // Create HTTP server
    const server = http.createServer(app);

    // Start listening
    server.listen(PORT, () => {
      Logger.startupInfo(PORT, NODE_ENV);
      Logger.info(`${SERVICE_NAME} is running at http://localhost:${PORT}`);
      Logger.info(`Environment: ${NODE_ENV}`);
      Logger.info(`Health check: http://localhost:${PORT}/health`);
      Logger.info(`API documentation: See README.md`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(server));
    process.on('SIGINT', () => gracefulShutdown(server));

  } catch (error) {
    Logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 * @param {http.Server} server - HTTP server instance
 */
async function gracefulShutdown(server) {
  Logger.info('SIGTERM signal received: closing HTTP server');

  // Stop accepting new connections
  server.close(() => {
    Logger.info('HTTP server closed');
    
    try {
      // Stop services
      // DISABLED: Automatic transcription services
      // BotPoolMonitor.stop();
      // Logger.info('✓ Bot Pool Monitor stopped');

      // AudioFetchService.stop();
      // Logger.info('✓ Audio Fetch Service stopped');

      TranscriptStreamService.stop();
      Logger.info('✓ Transcript Stream Service stopped');

      // ServiceMonitor.stop();
      // Logger.info('✓ Service Monitor stopped');

      Logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      Logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    Logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Memory usage logging
if (process.env.ENABLE_METRICS === 'true') {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    Logger.metric('memory_usage_mb', Math.round(memUsage.heapUsed / 1024 / 1024), {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    });
  }, 60000); // Every minute
}

// Periodic cleanup of old audio buffers
setInterval(() => {
  AudioFetchService.cleanupOldBuffers();
}, 300000); // Every 5 minutes

/**
 * Initialize service monitor for external dependencies
 */
function initializeServiceMonitor() {
  // Register Meeting Bot API for monitoring
  ServiceMonitor.register('meeting-bot-api', {
    url: `${process.env.MEETING_BOT_API_URL}/health`,
    onRecover: () => {
      Logger.info('Meeting Bot API recovered - resuming bot pool monitoring');
      // Restart bot pool monitor to catch up on any missed updates
      BotPoolMonitor.stop();
      setTimeout(() => {
        BotPoolMonitor.start();
        Logger.info('Bot Pool Monitor restarted after API recovery');
      }, 2000);
    },
    onFail: () => {
      Logger.warn('Meeting Bot API went down - bot pool monitoring will retry with backoff');
    }
  });

  // Start monitoring
  ServiceMonitor.start();
}

// Start the server
startServer().catch(error => {
  Logger.error('Fatal error:', error);
  process.exit(1);
});