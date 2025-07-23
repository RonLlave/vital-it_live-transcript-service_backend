const axios = require('axios');
const Logger = require('../utils/Logger');
const { ExternalAPIError, withRetry } = require('../utils/ErrorHandler');

class BotPoolMonitor {
  constructor() {
    this.apiUrl = process.env.MEETING_BOT_API_URL;
    this.apiKey = process.env.MEETING_BOT_API_KEY;
    this.pollInterval = parseInt(process.env.AUDIO_FETCH_INTERVAL) || 5000;
    this.isMonitoring = false;
    this.activeBots = new Map();
    this.listeners = new Set();
    this.lastPollTime = null;
    this.pollTimer = null;
  }

  /**
   * Initialize axios instance with default config
   */
  initializeAxios() {
    this.axios = axios.create({
      baseURL: this.apiUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
      }
    });

    // Add request/response interceptors for logging
    this.axios.interceptors.request.use(
      (config) => {
        Logger.debug('Meeting Bot API Request:', {
          method: config.method,
          url: config.url,
          params: config.params
        });
        return config;
      },
      (error) => {
        Logger.error('Meeting Bot API Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.axios.interceptors.response.use(
      (response) => {
        Logger.debug('Meeting Bot API Response:', {
          status: response.status,
          url: response.config.url
        });
        return response;
      },
      (error) => {
        Logger.error('Meeting Bot API Response Error:', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Start monitoring the bot pool
   */
  start() {
    if (this.isMonitoring) {
      Logger.warn('Bot pool monitor is already running');
      return;
    }

    this.initializeAxios();
    this.isMonitoring = true;
    Logger.info('Starting bot pool monitor', {
      pollInterval: this.pollInterval,
      apiUrl: this.apiUrl
    });

    this.poll();
  }

  /**
   * Stop monitoring the bot pool
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    Logger.info('Stopped bot pool monitor');
  }

  /**
   * Poll the Meeting Bot API for active bots
   */
  async poll() {
    if (!this.isMonitoring) {
      return;
    }

    try {
      const startTime = Date.now();
      const bots = await this.fetchActiveBots();
      const duration = Date.now() - startTime;

      Logger.metric('bot_pool_poll_duration', duration);
      this.lastPollTime = new Date();

      // Process bot updates
      this.processBotUpdates(bots);

      // Schedule next poll
      this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
    } catch (error) {
      Logger.error('Bot pool polling error:', error);
      
      // Don't crash on Meeting Bot API errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        Logger.warn('Meeting Bot API is unreachable, will retry...', {
          code: error.code,
          endpoint: this.apiUrl
        });
      }
      
      // Clear active bots if API is down
      if (this.activeBots.size > 0) {
        Logger.info('Clearing active bots due to API error');
        this.processBotUpdates([]);
      }
      
      // Retry with exponential backoff on error
      const retryDelay = Math.min(this.pollInterval * 2, 30000);
      Logger.info(`Retrying bot pool poll in ${retryDelay}ms`);
      this.pollTimer = setTimeout(() => this.poll(), retryDelay);
    }
  }

  /**
   * Fetch active bots from the Meeting Bot API
   * @returns {Promise<Array>} Array of active bots
   */
  async fetchActiveBots() {
    return withRetry(async () => {
      const response = await this.axios.get('/api/google-meet-guest/pool/active');

      if (!response.data || typeof response.data.count === 'undefined') {
        throw new ExternalAPIError('Meeting Bot API', 'Invalid response format');
      }

      const activeBots = response.data.bots || [];
      
      Logger.debug(`Found ${activeBots.length} active bots:`, activeBots.map(bot => ({
        botId: bot.poolBotId,
        legacyBotId: bot.legacyBotId,
        status: bot.status,
        meetingUrl: bot.meetingUrl
      })));
      
      return activeBots;
    }, {
      maxRetries: 3,
      delay: 1000,
      shouldRetry: (error) => {
        return error.response?.status >= 500 || error.code === 'ECONNABORTED';
      }
    });
  }

  /**
   * Process bot updates and notify listeners
   * @param {Array} bots - Current active bots
   */
  processBotUpdates(bots) {
    const currentBotIds = new Set(bots.map(bot => bot.legacyBotId));
    const previousBotIds = new Set(this.activeBots.keys());

    // Find new bots
    const newBots = bots.filter(bot => !previousBotIds.has(bot.legacyBotId));
    // Find removed bots
    const removedBotIds = [...previousBotIds].filter(id => !currentBotIds.has(id));
    
    // Find bots with newly available audio
    const botsWithNewAudio = bots.filter(bot => {
      const previousBot = this.activeBots.get(bot.legacyBotId);
      return previousBot && !previousBot.audioBlobUrl && bot.audioBlobUrl;
    });

    // Update active bots map
    this.activeBots.clear();
    bots.forEach(bot => {
      this.activeBots.set(bot.legacyBotId, {
        ...bot,
        botId: bot.poolBotId,
        lastSeen: new Date(),
        isNew: newBots.includes(bot)
      });
    });

    // Notify listeners of changes (including when audio becomes available)
    if (newBots.length > 0 || removedBotIds.length > 0 || botsWithNewAudio.length > 0) {
      Logger.info('Bot pool update detected', {
        newBots: newBots.length,
        removedBots: removedBotIds.length,
        botsWithNewAudio: botsWithNewAudio.length
      });
      
      this.notifyListeners({
        type: 'update',
        newBots,
        removedBots: removedBotIds,
        activeBots: Array.from(this.activeBots.values()),
        botsWithNewAudio
      });
    }

    // Log metrics
    Logger.metric('active_bots_count', this.activeBots.size);
    if (newBots.length > 0) {
      Logger.info(`New bots joined meetings: ${newBots.length}`, {
        botIds: newBots.map(b => b.poolBotId)
      });
    }
    if (removedBotIds.length > 0) {
      Logger.info(`Bots left meetings: ${removedBotIds.length}`, {
        botIds: removedBotIds
      });
    }
  }

  /**
   * Subscribe to bot pool updates
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    
    // Send current state to new subscriber
    if (this.activeBots.size > 0) {
      callback({
        type: 'initial',
        activeBots: Array.from(this.activeBots.values())
      });
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of updates
   * @param {Object} update - Update object
   */
  notifyListeners(update) {
    this.listeners.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        Logger.error('Error in bot pool listener:', error);
      }
    });
  }

  /**
   * Get current active bots
   * @returns {Array} Array of active bots
   */
  getActiveBots() {
    return Array.from(this.activeBots.values());
  }

  /**
   * Get bot by legacy ID
   * @param {string} legacyBotId - Legacy bot ID
   * @returns {Object|null} Bot object or null
   */
  getBot(legacyBotId) {
    return this.activeBots.get(legacyBotId) || null;
  }

  /**
   * Get monitor status
   * @returns {Object} Monitor status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      activeBotCount: this.activeBots.size,
      lastPollTime: this.lastPollTime,
      pollInterval: this.pollInterval,
      apiUrl: this.apiUrl
    };
  }

  /**
   * Force immediate poll
   */
  async forcePoll() {
    if (!this.isMonitoring) {
      throw new Error('Bot pool monitor is not running');
    }

    // Cancel scheduled poll
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }

    // Poll immediately
    await this.poll();
  }
}

module.exports = new BotPoolMonitor();