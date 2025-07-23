const axios = require('axios');
const Logger = require('../utils/Logger');
const AudioProcessor = require('../utils/AudioProcessor');
const BotPoolMonitor = require('./BotPoolMonitor');
const { ExternalAPIError, withRetry } = require('../utils/ErrorHandler');

class AudioFetchService {
  constructor() {
    this.apiUrl = process.env.MEETING_BOT_API_URL;
    this.apiKey = process.env.MEETING_BOT_API_KEY;
    this.bufferSize = parseInt(process.env.AUDIO_BUFFER_SIZE) || 30;
    this.isRunning = false;
    this.audioBuffers = new Map(); // botId -> { buffer, lastFetchTime, fingerprint }
    this.fetchPromises = new Map(); // botId -> Promise (to prevent duplicate fetches)
    this.axios = null;
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (!this.apiUrl) {
      throw new Error('MEETING_BOT_API_URL is not configured');
    }
    
    this.axios = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000, // 30 seconds for audio downloads
      headers: {
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
      },
      responseType: 'arraybuffer' // For binary audio data
    });

    Logger.info('AudioFetchService initialized with base URL:', this.apiUrl);

    // Subscribe to bot pool updates
    this.unsubscribe = BotPoolMonitor.subscribe(this.handleBotPoolUpdate.bind(this));
    
    this.isRunning = true;
  }

  /**
   * Stop the service
   */
  stop() {
    this.isRunning = false;
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.audioBuffers.clear();
    this.fetchPromises.clear();
    Logger.info('AudioFetchService stopped');
  }

  /**
   * Handle bot pool updates
   * @param {Object} update - Bot pool update
   */
  async handleBotPoolUpdate(update) {
    if (!this.isRunning) return;

    if (update.type === 'update' || update.type === 'initial') {
      // Fetch audio for all active bots
      const fetchPromises = update.activeBots.map(bot => {
        // Log bot details for debugging
        Logger.debug('Processing bot for audio fetch:', {
          botId: bot.poolBotId || bot.botId,
          legacyBotId: bot.legacyBotId,
          status: bot.status,
          meetingUrl: bot.meetingUrl
        });
        
        return this.fetchAudioForBot(bot)
          .then(result => {
            if (result && !result.audioNotReady) {
              Logger.info(`Successfully fetched audio for bot ${bot.poolBotId || bot.botId}`, {
                hasAudio: !!result.audioBuffer,
                isIncremental: result.isIncremental
              });
            }
            return result;
          })
          .catch(error => {
            const botIdentifier = bot.poolBotId || bot.botId || bot.legacyBotId || 'unknown';
            
            // Don't log as error if Meeting Bot API is down
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
              Logger.warn(`Meeting Bot API unavailable for audio fetch (bot ${botIdentifier})`, {
                code: error.code
              });
            } else {
              Logger.error(`Failed to fetch audio for bot ${botIdentifier}:`, error);
            }
          });
      });

      await Promise.allSettled(fetchPromises);

      // Clean up removed bots
      if (update.removedBots) {
        update.removedBots.forEach(legacyBotId => {
          this.audioBuffers.delete(legacyBotId);
          this.fetchPromises.delete(legacyBotId);
        });
      }
    }
  }

  /**
   * Fetch audio for a specific bot
   * @param {Object} bot - Bot object
   * @returns {Promise<Object>} Audio data
   */
  async fetchAudioForBot(bot) {
    // Handle different property naming conventions
    const legacyBotId = bot.legacyBotId;
    const botId = bot.poolBotId || bot.botId;
    
    if (!legacyBotId) {
      Logger.error('No legacy bot ID found for audio fetch:', bot);
      throw new Error('Missing legacy bot ID for audio fetch');
    }

    // Check if fetch is already in progress
    if (this.fetchPromises.has(legacyBotId)) {
      return this.fetchPromises.get(legacyBotId);
    }

    // Create fetch promise
    const fetchPromise = this._performAudioFetch({
      ...bot,
      legacyBotId,
      botId
    });
    this.fetchPromises.set(legacyBotId, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      this.fetchPromises.delete(legacyBotId);
    }
  }

  /**
   * Perform the actual audio fetch
   * @param {Object} bot - Bot object
   * @returns {Promise<Object>} Audio data
   */
  async _performAudioFetch(bot) {
    const { legacyBotId, botId } = bot;
    const meetingUrl = bot.meetingUrl || bot.meeting_url;
    const startTime = Date.now();
    
    Logger.debug(`Fetching audio for bot:`, {
      botId,
      legacyBotId,
      url: `/api/google-meet-guest/audio-blob/${legacyBotId}`
    });

    try {
      const audioBuffer = await withRetry(async () => {
        Logger.info(`Attempting to fetch audio from: ${this.apiUrl}/api/google-meet-guest/audio-blob/${legacyBotId}`);
        const response = await this.axios.get(
          `/api/google-meet-guest/audio-blob/${legacyBotId}`,
          {
            responseType: 'arraybuffer'
          }
        );
        Logger.info(`Audio fetch response status: ${response.status}, size: ${response.data?.byteLength || 0}`);
        return Buffer.from(response.data);
      }, {
        maxRetries: 2,
        delay: 1000,
        shouldRetry: (error) => {
          // Don't retry on 425 (Too Early) - audio might not be ready yet
          if (error.response?.status === 425) {
            Logger.debug(`Audio not ready yet for bot ${botId} (425 Too Early)`);
            return false;
          }
          return error.response?.status >= 500 || error.code === 'ECONNABORTED';
        }
      });

      const duration = Date.now() - startTime;
      Logger.apiRequest('GET', `/audio-blob/${legacyBotId}`, 200, duration);

      // Simple check if audio has content (skip ffmpeg check)
      const hasContent = audioBuffer && audioBuffer.length > 1000; // At least 1KB
      if (!hasContent) {
        Logger.debug(`No audio content for bot ${botId}`);
        return null;
      }
      
      Logger.info(`Audio has content: ${audioBuffer.length} bytes`);

      // Calculate fingerprint for deduplication
      const fingerprint = AudioProcessor.calculateAudioFingerprint(audioBuffer);
      
      // Check if this is new audio
      const existingBuffer = this.audioBuffers.get(legacyBotId);
      if (existingBuffer && existingBuffer.fingerprint === fingerprint) {
        Logger.debug(`Audio unchanged for bot ${botId}`);
        return null;
      }

      // Process new audio - simplified metadata
      const metadata = {
        duration: audioBuffer.length / (16000 * 2), // Estimate: 16kHz, 16-bit mono
        size: audioBuffer.length,
        format: 'wav'
      };
      
      Logger.info(`Audio metadata: duration ~${metadata.duration.toFixed(1)}s, size: ${metadata.size} bytes`);
      
      // Determine if this is incremental audio
      const isIncremental = existingBuffer && 
        audioBuffer.length > existingBuffer.buffer.length;

      let incrementalBuffer = audioBuffer;
      if (isIncremental && existingBuffer) {
        // For incremental, use the full buffer for now (skip ffmpeg extraction)
        // In production, would extract only new portion
        Logger.info(`Incremental audio detected, using full buffer for processing`);
        incrementalBuffer = audioBuffer;
      }

      // Store the audio buffer
      this.audioBuffers.set(legacyBotId, {
        buffer: audioBuffer,
        incrementalBuffer: isIncremental ? incrementalBuffer : audioBuffer,
        lastFetchTime: new Date(),
        fingerprint,
        metadata,
        botId,
        meetingUrl
      });

      Logger.info(`Fetched audio for bot ${botId}`, {
        size: audioBuffer.length,
        duration: metadata.duration,
        isIncremental,
        incrementalDuration: metadata.duration
      });

      return {
        botId,
        legacyBotId,
        meetingUrl,
        audioBuffer: incrementalBuffer,
        fullBuffer: audioBuffer,
        metadata,
        isIncremental,
        timestamp: new Date()
      };

    } catch (error) {
      if (error.response?.status === 404) {
        Logger.warn(`Audio not found for bot ${botId}`);
        return null;
      }
      
      if (error.response?.status === 425) {
        Logger.info(`Audio not ready yet for bot ${botId} (425 Too Early) - will retry on next poll`);
        // Don't store anything, just return null to retry next time
        return null;
      }
      
      Logger.error('Audio fetch error details:', {
        botId,
        legacyBotId,
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.message,
        url: error.config?.url
      });
      
      throw new ExternalAPIError(
        'Meeting Bot API',
        `Failed to fetch audio: ${error.message}`,
        error.response?.status
      );
    }
  }

  /**
   * Get audio buffer for a bot
   * @param {string} legacyBotId - Legacy bot ID
   * @returns {Object|null} Audio buffer data
   */
  getAudioBuffer(legacyBotId) {
    return this.audioBuffers.get(legacyBotId) || null;
  }

  /**
   * Get all active audio buffers
   * @returns {Array} Array of audio buffer data
   */
  getAllAudioBuffers() {
    return Array.from(this.audioBuffers.values());
  }

  /**
   * Get service status
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeBuffers: this.audioBuffers.size,
      bufferDetails: Array.from(this.audioBuffers.entries()).map(([id, buffer]) => ({
        legacyBotId: id,
        botId: buffer.botId,
        size: buffer.buffer.length,
        duration: buffer.metadata?.duration || 0,
        lastFetchTime: buffer.lastFetchTime
      }))
    };
  }

  /**
   * Clean up old audio buffers
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanupOldBuffers(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    let cleaned = 0;

    for (const [legacyBotId, buffer] of this.audioBuffers.entries()) {
      if (now - buffer.lastFetchTime.getTime() > maxAge) {
        this.audioBuffers.delete(legacyBotId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      Logger.info(`Cleaned up ${cleaned} old audio buffers`);
    }
  }
}

module.exports = new AudioFetchService();