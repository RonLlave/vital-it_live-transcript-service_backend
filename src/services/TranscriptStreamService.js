const EventEmitter = require('events');
const Logger = require('../utils/Logger');
const AudioFetchService = require('./AudioFetchService');
const GeminiTranscriptionService = require('./GeminiTranscriptionService');
const MeetingMetadataService = require('./MeetingMetadataService');
const BotPoolMonitor = require('./BotPoolMonitor');
const { AppError } = require('../utils/ErrorHandler');

class TranscriptStreamService extends EventEmitter {
  constructor() {
    super();
    this.transcriptSessions = new Map(); // sessionId -> TranscriptSession
    this.botToSessionMap = new Map(); // legacyBotId -> sessionId
    this.sseClients = new Map(); // sessionId -> Set of SSE response objects
    this.isRunning = false;
    this.stats = {
      totalSessions: 0,
      activeSessions: 0,
      totalSegments: 0,
      totalWords: 0
    };
  }

  /**
   * Initialize the service
   */
  async initialize() {
    // Subscribe to bot pool updates to create sessions immediately
    BotPoolMonitor.subscribe(this.handleBotPoolUpdate.bind(this));
    
    this.isRunning = true;
    
    // Start processing loop
    this.startProcessingLoop();
    
    Logger.info('TranscriptStreamService initialized');
  }

  /**
   * Handle bot pool updates to create sessions for new bots
   */
  handleBotPoolUpdate(update) {
    if (!this.isRunning) return;

    if (update.type === 'update' || update.type === 'initial') {
      // Create sessions for all active bots
      update.activeBots.forEach(bot => {
        const legacyBotId = bot.legacyBotId;
        const botId = bot.poolBotId || bot.botId;
        const meetingUrl = bot.meetingUrl;
        
        if (!this.botToSessionMap.has(legacyBotId)) {
          Logger.info(`Creating session for new bot ${botId} in meeting`);
          this.createSession(botId, legacyBotId, meetingUrl);
        }
      });

      // Remove sessions for bots that left
      if (update.removedBots) {
        update.removedBots.forEach(legacyBotId => {
          const sessionId = this.botToSessionMap.get(legacyBotId);
          if (sessionId) {
            this.stopSession(sessionId);
          }
        });
      }
    }
  }

  /**
   * Start the audio processing loop
   */
  startProcessingLoop() {
    if (!this.isRunning) return;

    setInterval(async () => {
      try {
        await this.processAudioBuffers();
      } catch (error) {
        Logger.error('Error in transcript processing loop:', error);
      }
    }, parseInt(process.env.AUDIO_FETCH_INTERVAL) || 5000);
  }

  /**
   * Process available audio buffers
   */
  async processAudioBuffers() {
    const audioBuffers = AudioFetchService.getAllAudioBuffers();
    
    Logger.debug(`Processing ${audioBuffers.length} audio buffers`);
    
    for (const buffer of audioBuffers) {
      try {
        Logger.debug(`Processing audio buffer for bot ${buffer.botId}`, {
          legacyBotId: buffer.legacyBotId,
          hasIncrementalBuffer: !!buffer.incrementalBuffer,
          bufferSize: buffer.buffer?.length || 0
        });
        
        await this.processAudioBuffer(buffer);
      } catch (error) {
        Logger.error(`Failed to process audio for bot ${buffer.botId}:`, error);
      }
    }
  }

  /**
   * Process a single audio buffer
   * @param {Object} audioData - Audio data from AudioFetchService
   */
  async processAudioBuffer(audioData) {
    const { botId, legacyBotId, meetingUrl, incrementalBuffer, metadata } = audioData;
    
    Logger.debug(`Processing audio buffer details:`, {
      botId,
      legacyBotId,
      meetingUrl,
      hasIncrementalBuffer: !!incrementalBuffer,
      fingerprint: audioData.fingerprint
    });
    
    // Get session (should already exist from bot pool update)
    let sessionId = this.botToSessionMap.get(legacyBotId);
    if (!sessionId) {
      Logger.warn(`No session found for bot ${botId}, creating one now`);
      sessionId = this.createSession(botId, legacyBotId, meetingUrl);
    }

    const session = this.transcriptSessions.get(sessionId);
    if (!session) {
      Logger.error(`Session ${sessionId} not found after creation`);
      return;
    }

    // Check if we have new audio to process
    if (!incrementalBuffer || session.lastProcessedFingerprint === audioData.fingerprint) {
      Logger.debug(`No new audio to process for session ${sessionId}`, {
        hasIncrementalBuffer: !!incrementalBuffer,
        fingerprintMatch: session.lastProcessedFingerprint === audioData.fingerprint
      });
      return;
    }

    // Transcribe the audio
    const transcription = await GeminiTranscriptionService.transcribeAudio(
      incrementalBuffer,
      {
        botId,
        meetingUrl,
        isIncremental: session.segments.length > 0,
        previousContext: session.context
      }
    );

    // Update session with new transcription
    this.updateSession(sessionId, transcription);
    session.lastProcessedFingerprint = audioData.fingerprint;
  }

  /**
   * Create a new transcript session
   * @param {string} botId - Bot ID
   * @param {string} legacyBotId - Legacy bot ID
   * @param {string} meetingUrl - Meeting URL
   * @returns {string} Session ID
   */
  createSession(botId, legacyBotId, meetingUrl) {
    const sessionId = `${botId}_transcript`;
    
    const session = {
      sessionId,
      botId,
      legacyBotId,
      meetingUrl,
      startedAt: new Date(),
      lastUpdated: new Date(),
      status: 'active',
      segments: [],
      speakers: new Set(),
      detectedLanguage: null,
      languageConfidence: 0,
      alternativeLanguages: [],
      wordCount: 0,
      duration: 0,
      lastProcessedFingerprint: null,
      context: {
        lastSpeaker: null,
        totalDuration: 0,
        speakers: []
      },
      metadata: null,
      aiSummary: null,
      lastSummaryUpdate: null,
      summaryUpdateInterval: 60000 // Update summary every minute
    };

    this.transcriptSessions.set(sessionId, session);
    this.botToSessionMap.set(legacyBotId, sessionId);
    
    this.stats.totalSessions++;
    this.stats.activeSessions++;
    
    Logger.info(`Created transcript session ${sessionId} for bot ${botId}`);
    
    // Fetch metadata asynchronously
    this.fetchSessionMetadata(session);
    
    return sessionId;
  }

  /**
   * Fetch and update session metadata
   * @param {Object} session - Session object
   */
  async fetchSessionMetadata(session) {
    try {
      const metadata = await MeetingMetadataService.getMeetingMetadata(
        session.botId,
        session.legacyBotId
      );
      session.metadata = metadata;
      Logger.info(`Updated metadata for session ${session.sessionId}`, {
        event_id: metadata.event_id,
        participantCount: metadata.participants?.length || 0
      });
    } catch (error) {
      Logger.error(`Failed to fetch metadata for session ${session.sessionId}:`, error);
    }
  }

  /**
   * Update session with new transcription
   * @param {string} sessionId - Session ID
   * @param {Object} transcription - Transcription data
   */
  updateSession(sessionId, transcription) {
    const session = this.transcriptSessions.get(sessionId);
    if (!session) return;

    // Add segments
    if (transcription.segments && transcription.segments.length > 0) {
      transcription.segments.forEach(segment => {
        const segmentWithId = {
          ...segment,
          id: `${sessionId}_seg_${session.segments.length + 1}`,
          sessionTime: Date.now() - session.startedAt.getTime()
        };
        
        session.segments.push(segmentWithId);
        
        // Update speakers
        if (segment.speaker) {
          session.speakers.add(segment.speaker);
        }
      });

      // Update statistics
      session.wordCount = transcription.wordCount || session.wordCount;
      session.duration = transcription.duration || session.duration;
      
      // Update language detection
      if (transcription.detectedLanguage) {
        session.detectedLanguage = transcription.detectedLanguage;
        session.languageConfidence = transcription.languageConfidence || 0;
        session.alternativeLanguages = transcription.alternativeLanguages || [];
      }

      // Update context for next transcription
      session.context = transcription.context || session.context;
      
      // Update last updated timestamp
      session.lastUpdated = new Date();

      // Update global stats
      this.stats.totalSegments += transcription.segments.length;
      this.stats.totalWords = session.wordCount;

      // Broadcast update to SSE clients
      this.broadcastUpdate(sessionId, {
        type: 'transcript_update',
        segments: transcription.segments,
        stats: {
          wordCount: session.wordCount,
          duration: session.duration,
          speakerCount: session.speakers.size,
          detectedLanguage: session.detectedLanguage
        }
      });

      Logger.info(`Updated transcript for session ${sessionId}`, {
        newSegments: transcription.segments.length,
        totalSegments: session.segments.length,
        wordCount: session.wordCount
      });
    }
  }

  /**
   * Stop a transcript session
   * @param {string} sessionId - Session ID
   */
  stopSession(sessionId) {
    const session = this.transcriptSessions.get(sessionId);
    if (!session) return;

    session.status = 'stopped';
    session.lastUpdated = new Date();
    this.stats.activeSessions--;

    // Remove from bot mapping
    this.botToSessionMap.delete(session.legacyBotId);

    // Notify SSE clients
    this.broadcastUpdate(sessionId, {
      type: 'session_stopped',
      sessionId,
      timestamp: new Date()
    });

    // Close all SSE connections for this session
    const clients = this.sseClients.get(sessionId);
    if (clients) {
      clients.forEach(client => {
        try {
          client.end();
        } catch (error) {
          // Ignore errors when closing
        }
      });
      this.sseClients.delete(sessionId);
    }

    Logger.info(`Stopped transcript session ${sessionId}`);
  }

  /**
   * Get active transcript sessions
   * @returns {Array} Array of active sessions
   */
  getActiveSessions() {
    const sessions = [];
    this.transcriptSessions.forEach(session => {
      if (session.status === 'active') {
        sessions.push({
          sessionId: session.sessionId,
          botId: session.botId,
          legacyBotId: session.legacyBotId,
          meetingUrl: session.meetingUrl,
          startedAt: session.startedAt,
          duration: session.duration,
          durationFormatted: this.formatDuration(session.duration),
          transcriptLength: session.segments.length,
          lastUpdated: session.lastUpdated,
          status: session.status,
          detectedLanguage: session.detectedLanguage,
          languageConfidence: session.languageConfidence,
          speakerCount: session.speakers.size,
          wordCount: session.wordCount
        });
      }
    });
    return sessions;
  }

  /**
   * Get transcript for a session
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Transcript data
   */
  getTranscript(sessionId) {
    const session = this.transcriptSessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId: session.sessionId,
      botId: session.botId,
      meetingUrl: session.meetingUrl,
      transcript: {
        segments: session.segments,
        fullText: session.segments.map(s => s.text).join(' '),
        wordCount: session.wordCount,
        duration: session.duration,
        detectedLanguage: session.detectedLanguage,
        languageConfidence: session.languageConfidence,
        alternativeLanguages: session.alternativeLanguages,
        speakers: Array.from(session.speakers)
      },
      metadata: {
        startedAt: session.startedAt,
        lastUpdated: session.lastUpdated,
        status: session.status,
        durationFormatted: this.formatDuration(session.duration)
      }
    };
  }

  /**
   * Add SSE client for a session
   * @param {string} sessionId - Session ID
   * @param {Object} res - Express response object
   */
  addSSEClient(sessionId, res) {
    if (!this.sseClients.has(sessionId)) {
      this.sseClients.set(sessionId, new Set());
    }
    this.sseClients.get(sessionId).add(res);
    Logger.debug(`Added SSE client for session ${sessionId}`);
  }

  /**
   * Remove SSE client for a session
   * @param {string} sessionId - Session ID
   * @param {Object} res - Express response object
   */
  removeSSEClient(sessionId, res) {
    const clients = this.sseClients.get(sessionId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.sseClients.delete(sessionId);
      }
    }
  }

  /**
   * Broadcast update to SSE clients
   * @param {string} sessionId - Session ID
   * @param {Object} data - Data to broadcast
   */
  broadcastUpdate(sessionId, data) {
    const clients = this.sseClients.get(sessionId);
    if (!clients) return;

    const eventData = JSON.stringify({
      ...data,
      timestamp: new Date().toISOString()
    });

    clients.forEach(client => {
      try {
        if (data.segments) {
          // Send each segment as a separate event
          data.segments.forEach(segment => {
            client.write(`event: transcript_update\n`);
            client.write(`data: ${JSON.stringify({
              timestamp: new Date().toISOString(),
              speaker: segment.speaker,
              text: segment.text,
              startTime: segment.startTime,
              endTime: segment.endTime,
              confidence: segment.confidence
            })}\n\n`);
          });
        } else {
          client.write(`event: ${data.type}\n`);
          client.write(`data: ${eventData}\n\n`);
        }
      } catch (error) {
        Logger.error('Error broadcasting to SSE client:', error);
        this.removeSSEClient(sessionId, client);
      }
    });
  }

  /**
   * Format duration in seconds to HH:MM:SS
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   */
  static formatDuration(seconds) {
    if (!seconds || seconds < 0) return '00:00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return [hours, minutes, secs]
      .map(v => v.toString().padStart(2, '0'))
      .join(':');
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      ...this.stats,
      sessions: Array.from(this.transcriptSessions.values()).map(session => ({
        sessionId: session.sessionId,
        duration: this.formatDuration(session.duration),
        wordCount: session.wordCount,
        language: session.detectedLanguage,
        speakers: session.speakers.size
      }))
    };
  }

  /**
   * Stop the service
   */
  stop() {
    this.isRunning = false;
    
    // Stop all active sessions
    this.transcriptSessions.forEach((session, sessionId) => {
      if (session.status === 'active') {
        this.stopSession(sessionId);
      }
    });
    
    Logger.info('TranscriptStreamService stopped');
  }
}

module.exports = new TranscriptStreamService();