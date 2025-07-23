const axios = require('axios');
const Logger = require('../utils/Logger');
const { ExternalAPIError, withRetry } = require('../utils/ErrorHandler');

class MeetingMetadataService {
  constructor() {
    this.apiUrl = process.env.MEETING_BOT_API_URL;
    this.apiKey = process.env.MEETING_BOT_API_KEY;
    this.axios = null;
    this.metadataCache = new Map(); // Cache meeting metadata
  }

  /**
   * Initialize the service
   */
  initialize() {
    this.axios = axios.create({
      baseURL: this.apiUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
      }
    });

    Logger.info('MeetingMetadataService initialized');
  }

  /**
   * Get meeting metadata by bot ID or legacy bot ID
   * @param {string} botId - Bot ID
   * @param {string} legacyBotId - Legacy bot ID
   * @returns {Promise<Object>} Meeting metadata
   */
  async getMeetingMetadata(botId, legacyBotId) {
    // Check cache first
    const cacheKey = botId || legacyBotId;
    if (this.metadataCache.has(cacheKey)) {
      const cached = this.metadataCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 300000) { // 5 minutes cache
        return cached.data;
      }
    }

    try {
      // First, try to get bot details
      const botDetails = await this.getBotDetails(botId, legacyBotId);
      
      // Extract meeting information
      const metadata = {
        event_id: botDetails.event_id || botDetails.eventId || botDetails.currentMeeting?.eventId || botDetails.meetingId || null,
        meetingUrl: botDetails.meetingUrl || botDetails.meeting_url || null,
        meetingTitle: botDetails.meetingTitle || botDetails.meeting_title || 'Untitled Meeting',
        participants: await this.extractParticipants(botDetails),
        organizer: botDetails.organizer || botDetails.meeting_organizer || botDetails.userEmail || null,
        scheduledStartTime: botDetails.scheduledStartTime || botDetails.scheduled_start || null,
        scheduledEndTime: botDetails.scheduledEndTime || botDetails.scheduled_end || null,
        actualStartTime: botDetails.startedAt || botDetails.joinedAt || botDetails.joined_at || null,
        meetingType: botDetails.meetingType || 'scheduled',
        recordingEnabled: botDetails.recordingEnabled || false,
        botInfo: {
          botId: botId || botDetails.poolBotId,
          legacyBotId: legacyBotId,
          botName: botDetails.botName || botDetails.bot_name || 'Meeting Bot',
          status: botDetails.status || 'unknown'
        }
      };

      // Cache the metadata
      this.metadataCache.set(cacheKey, {
        data: metadata,
        timestamp: Date.now()
      });

      return metadata;

    } catch (error) {
      Logger.error('Failed to fetch meeting metadata:', error);
      
      // Return minimal metadata on error
      return {
        event_id: null,
        meetingUrl: null,
        meetingTitle: 'Unknown Meeting',
        participants: [],
        organizer: null,
        scheduledStartTime: null,
        scheduledEndTime: null,
        actualStartTime: new Date().toISOString(),
        meetingType: 'unknown',
        recordingEnabled: false,
        botInfo: {
          botId: botId,
          legacyBotId: legacyBotId,
          botName: 'Meeting Bot',
          status: 'error'
        },
        error: error.message
      };
    }
  }

  /**
   * Get bot details from Meeting Bot API
   * @param {string} botId - Bot ID
   * @param {string} legacyBotId - Legacy bot ID
   * @returns {Promise<Object>} Bot details
   */
  async getBotDetails(botId, legacyBotId) {
    // Try multiple endpoints to get bot information
    const endpoints = [
      `/api/google-meet-guest/bots/${botId}`,
      `/api/google-meet-guest/legacy/${legacyBotId}`,
      `/api/google-meet-guest/pool/active`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await withRetry(async () => {
          return await this.axios.get(endpoint);
        }, {
          maxRetries: 2,
          delay: 500
        });

        if (response.data) {
          // If it's the pool active endpoint, find our bot
          if (endpoint.includes('pool/active')) {
            const bots = response.data.bots || [];
            const bot = bots.find(b => 
              b.poolBotId === botId ||
              b.legacyBotId === legacyBotId
            );
            if (bot) return bot;
          } else {
            return response.data;
          }
        }
      } catch (error) {
        // Continue to next endpoint
        Logger.debug(`Failed to fetch from ${endpoint}:`, error.message);
      }
    }

    throw new ExternalAPIError('Meeting Bot API', 'Unable to fetch bot details');
  }

  /**
   * Extract participants from bot details
   * @param {Object} botDetails - Bot details
   * @returns {Promise<Array>} List of participants
   */
  async extractParticipants(botDetails) {
    const participants = [];

    // Extract from various possible fields
    if (botDetails.participants) {
      // Handle the active endpoint format { count: X, list: [...] }
      if (botDetails.participants.list && Array.isArray(botDetails.participants.list)) {
        participants.push(...botDetails.participants.list);
      } else if (Array.isArray(botDetails.participants)) {
        participants.push(...botDetails.participants);
      } else {
        participants.push(botDetails.participants);
      }
    }

    if (botDetails.attendees) {
      participants.push(...(Array.isArray(botDetails.attendees) ? 
        botDetails.attendees : [botDetails.attendees]));
    }

    // Extract from meeting metadata if available
    if (botDetails.meeting?.participants) {
      participants.push(...botDetails.meeting.participants);
    }

    // Normalize participant data
    const normalizedParticipants = participants.map(p => {
      if (typeof p === 'string') {
        return { name: p, email: null, role: 'participant' };
      }
      return {
        name: p.name || p.displayName || 'Unknown',
        email: p.email || null,
        role: p.role || 'participant',
        joinedAt: p.joinedAt || null,
        leftAt: p.leftAt || null
      };
    });

    // Remove duplicates based on name
    const uniqueParticipants = normalizedParticipants.filter((p, index, self) =>
      index === self.findIndex(t => t.name === p.name)
    );

    return uniqueParticipants;
  }

  /**
   * Get meeting statistics
   * @param {string} botId - Bot ID
   * @returns {Promise<Object>} Meeting statistics
   */
  async getMeetingStats(botId) {
    try {
      const response = await this.axios.get(`/api/google-meet-guest/stats/${botId}`);
      return response.data || {
        duration: 0,
        participantCount: 0,
        messageCount: 0,
        recordingSize: 0
      };
    } catch (error) {
      Logger.debug('Failed to fetch meeting stats:', error.message);
      return {
        duration: 0,
        participantCount: 0,
        messageCount: 0,
        recordingSize: 0
      };
    }
  }

  /**
   * Clear metadata cache
   */
  clearCache() {
    this.metadataCache.clear();
    Logger.debug('Meeting metadata cache cleared');
  }
}

module.exports = new MeetingMetadataService();