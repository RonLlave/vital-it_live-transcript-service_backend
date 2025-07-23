const EventEmitter = require('events');
const Logger = require('../utils/Logger');
const AudioFetchService = require('./AudioFetchService');
const GeminiTranscriptionService = require('./GeminiTranscriptionService');
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
    // Subscribe to audio fetch events
    AudioFetchService.on = this.on.bind(this); // Enable event listening
    this.isRunning = true;
    
    // Start processing loop
    this.startProcessingLoop();
    
    Logger.info('TranscriptStreamService initialized');
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
    
    for (const buffer of audioBuffers) {
      try {
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
    
    // Get or create session
    let sessionId = this.botToSessionMap.get(legacyBotId);
    if (!sessionId) {
      sessionId = this.createSession(botId, legacyBotId, meetingUrl);
    }

    const session = this.transcriptSessions.get(sessionId);
    if (!session) return;

    // Check if we have new audio to process
    if (!incrementalBuffer || session.lastProcessedFingerprint === audioData.fingerprint) {
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
      }
    };

    this.transcriptSessions.set(sessionId, session);
    this.botToSessionMap.set(legacyBotId, sessionId);
    
    this.stats.totalSessions++;
    this.stats.activeSessions++;
    
    Logger.info(`Created transcript session ${sessionId} for bot ${botId}`);
    
    return sessionId;
  }

  /**
   * Update session with new transcription
   * @param {string} sessionId - Session ID
   * @param {Object} transcription - Transcription data
   */
  updateSession(sessionId, transcription) {
    const session = this.transcriptSessions.get(sessionId);
    if (!session) return;

    // Update language information
    if (!session.detectedLanguage || transcription.languageConfidence > session.languageConfidence) {
      session.detectedLanguage = transcription.detectedLanguage;
      session.languageConfidence = transcription.languageConfidence;
      session.alternativeLanguages = transcription.alternativeLanguages;
    }

    // Add new segments
    const newSegments = transcription.segments.map(segment => ({
      ...segment,
      sessionTime: Date.now() - session.startedAt.getTime(),
      id: `${sessionId}_seg_${session.segments.length + 1}`
    }));

    session.segments.push(...newSegments);
    
    // Update speakers
    newSegments.forEach(segment => {
      if (segment.speaker && segment.speaker !== 'Unknown') {
        session.speakers.add(segment.speaker);
      }
    });

    // Update stats
    session.wordCount += transcription.wordCount;
    session.duration = Math.max(
      session.duration,
      ...newSegments.map(s => s.endTime)
    );
    session.lastUpdated = new Date();

    // Update context for next transcription
    if (newSegments.length > 0) {
      const lastSegment = newSegments[newSegments.length - 1];
      session.context = {
        lastSpeaker: lastSegment.speaker,
        totalDuration: session.duration,
        speakers: Array.from(session.speakers)
      };
    }

    this.stats.totalSegments += newSegments.length;
    this.stats.totalWords += transcription.wordCount;

    // Emit updates to SSE clients
    this.emitTranscriptUpdate(sessionId, newSegments);
    
    Logger.debug(`Updated session ${sessionId} with ${newSegments.length} new segments`);
  }

  /**
   * Emit transcript updates to SSE clients
   * @param {string} sessionId - Session ID
   * @param {Array} newSegments - New transcript segments
   */
  emitTranscriptUpdate(sessionId, newSegments) {
    const clients = this.sseClients.get(sessionId);
    if (!clients || clients.size === 0) return;

    const session = this.transcriptSessions.get(sessionId);
    
    // Send updates to all connected clients
    clients.forEach(res => {
      try {
        // Send new segments
        newSegments.forEach(segment => {
          res.write(`event: transcript_update\n`);
          res.write(`data: ${JSON.stringify({
            timestamp: new Date().toISOString(),
            speaker: segment.speaker,
            text: segment.text,
            startTime: segment.startTime,
            endTime: segment.endTime,
            confidence: segment.confidence
          })}\n\n`);
        });

        // Send speaker changes
        if (newSegments.length > 1) {
          for (let i = 1; i < newSegments.length; i++) {
            if (newSegments[i].speaker !== newSegments[i-1].speaker) {
              res.write(`event: speaker_change\n`);
              res.write(`data: ${JSON.stringify({
                timestamp: new Date().toISOString(),
                previousSpeaker: newSegments[i-1].speaker,
                currentSpeaker: newSegments[i].speaker
              })}\n\n`);
            }
          }
        }

        // Send session update
        res.write(`event: session_update\n`);
        res.write(`data: ${JSON.stringify({
          wordCount: session.wordCount,
          duration: session.duration,
          speakerCount: session.speakers.size,
          detectedLanguage: session.detectedLanguage
        })}\n\n`);

      } catch (error) {
        Logger.error('Failed to send SSE update:', error);
        clients.delete(res);
      }
    });
  }

  /**
   * Get all active transcript sessions
   * @returns {Array} Active sessions
   */
  getActiveSessions() {
    return Array.from(this.transcriptSessions.values())
      .filter(session => session.status === 'active')
      .map(session => ({
        sessionId: session.sessionId,
        botId: session.botId,
        legacyBotId: session.legacyBotId,
        meetingUrl: session.meetingUrl,
        startedAt: session.startedAt,
        duration: session.duration,
        durationFormatted: this.formatDuration(session.duration),
        transcriptLength: session.segments.reduce((sum, seg) => sum + seg.text.length, 0),
        lastUpdated: session.lastUpdated,
        status: session.status,
        detectedLanguage: session.detectedLanguage,
        languageConfidence: session.languageConfidence,
        speakerCount: session.speakers.size,
        wordCount: session.wordCount
      }));
  }

  /**
   * Get transcript for a session
   * @param {string} sessionId - Session ID
   * @returns {Object} Transcript data
   */
  getTranscript(sessionId) {
    const session = this.transcriptSessions.get(sessionId);
    if (!session) {
      throw new AppError(`Session ${sessionId} not found`, 404);
    }

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
    
    // Send initial data
    const session = this.transcriptSessions.get(sessionId);
    if (session) {
      res.write(`event: connected\n`);
      res.write(`data: ${JSON.stringify({
        sessionId,
        currentDuration: session.duration,
        wordCount: session.wordCount,
        segmentCount: session.segments.length
      })}\n\n`);
    }
  }

  /**
   * Remove SSE client
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
   * Stop transcription for a session
   * @param {string} sessionId - Session ID
   */
  stopSession(sessionId) {
    const session = this.transcriptSessions.get(sessionId);
    if (!session) {
      throw new AppError(`Session ${sessionId} not found`, 404);
    }

    session.status = 'stopped';
    session.lastUpdated = new Date();
    this.stats.activeSessions--;

    // Remove bot mapping
    this.botToSessionMap.delete(session.legacyBotId);

    // Notify SSE clients
    const clients = this.sseClients.get(sessionId);
    if (clients) {
      clients.forEach(res => {
        try {
          res.write(`event: session_stopped\n`);
          res.write(`data: ${JSON.stringify({
            sessionId,
            timestamp: new Date().toISOString()
          })}\n\n`);
          res.end();
        } catch (error) {
          // Client already disconnected
        }
      });
      this.sseClients.delete(sessionId);
    }

    Logger.info(`Stopped transcript session ${sessionId}`);
  }

  /**
   * Format duration in seconds to HH:MM:SS
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   */
  formatDuration(seconds) {
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
      transcriptionStats: GeminiTranscriptionService.getStats()
    };
  }

  /**
   * Stop the service
   */
  stop() {
    this.isRunning = false;
    
    // Close all SSE connections
    this.sseClients.forEach((clients, sessionId) => {
      clients.forEach(res => {
        try {
          res.end();
        } catch (error) {
          // Ignore
        }
      });
    });
    
    this.sseClients.clear();
    Logger.info('TranscriptStreamService stopped');
  }
}

module.exports = new TranscriptStreamService();