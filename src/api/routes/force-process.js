const express = require('express');
const router = express.Router();
const axios = require('axios');
const Logger = require('../../utils/Logger');
const TranscriptStreamService = require('../../services/TranscriptStreamService');
const GeminiTranscriptionService = require('../../services/GeminiTranscriptionService');

/**
 * Force process audio for active bot
 * POST /api/force-process/audio
 */
router.post('/audio', async (req, res) => {
  try {
    // Get active bot
    const apiUrl = process.env.MEETING_BOT_API_URL;
    const apiKey = process.env.MEETING_BOT_API_KEY;
    
    const poolResponse = await axios.get(
      `${apiUrl}/api/google-meet-guest/pool/active`,
      {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
      }
    );
    
    if (poolResponse.data.count === 0) {
      return res.json({ success: false, error: 'No active bots' });
    }
    
    const bot = poolResponse.data.bots[0];
    const sessionId = `${bot.poolBotId}_transcript`;
    
    // Check if session exists
    const session = TranscriptStreamService.transcriptSessions.get(sessionId);
    if (!session) {
      return res.json({ 
        success: false, 
        error: 'Session not found',
        sessionId,
        hint: 'Session should have been created automatically'
      });
    }
    
    // Fetch audio
    Logger.info(`Force processing audio for bot ${bot.poolBotId}`);
    
    const audioResponse = await axios.get(
      `${apiUrl}/api/google-meet-guest/audio-blob/${bot.legacyBotId}`,
      {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
        responseType: 'arraybuffer',
        timeout: 30000
      }
    );
    
    const audioBuffer = Buffer.from(audioResponse.data);
    Logger.info(`Fetched ${audioBuffer.length} bytes of audio`);
    
    // Take first 60 seconds for testing
    const maxSize = 2 * 1024 * 1024; // 2MB max
    const testBuffer = audioBuffer.slice(0, Math.min(audioBuffer.length, maxSize));
    
    // Transcribe
    const transcription = await GeminiTranscriptionService.transcribeAudio(
      testBuffer,
      {
        botId: bot.poolBotId,
        meetingUrl: bot.meetingUrl,
        isIncremental: false
      }
    );
    
    // Update session
    if (transcription.segments && transcription.segments.length > 0) {
      TranscriptStreamService.updateSession(sessionId, transcription);
      
      res.json({
        success: true,
        sessionId,
        audioSize: audioBuffer.length,
        testSize: testBuffer.length,
        transcription: {
          segments: transcription.segments.length,
          words: transcription.wordCount,
          language: transcription.detectedLanguage,
          firstSegment: transcription.segments[0]
        },
        message: 'Audio processed and transcript updated'
      });
    } else {
      res.json({
        success: false,
        error: 'No segments in transcription',
        transcription
      });
    }
    
  } catch (error) {
    Logger.error('Force process error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;