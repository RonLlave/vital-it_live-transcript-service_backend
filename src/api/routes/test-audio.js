const express = require('express');
const router = express.Router();
const axios = require('axios');
const AudioFetchService = require('../../services/AudioFetchService');
const BotPoolMonitor = require('../../services/BotPoolMonitor');

/**
 * Test audio fetch directly
 * GET /api/test/audio-fetch/:legacyBotId
 */
router.get('/audio-fetch/:legacyBotId', async (req, res) => {
  const { legacyBotId } = req.params;
  
  try {
    const apiUrl = process.env.MEETING_BOT_API_URL;
    const apiKey = process.env.MEETING_BOT_API_KEY;
    
    console.log(`Testing audio fetch for legacy bot ID: ${legacyBotId}`);
    console.log(`API URL: ${apiUrl}/api/google-meet-guest/audio-blob/${legacyBotId}`);
    
    const response = await axios.get(
      `${apiUrl}/api/google-meet-guest/audio-blob/${legacyBotId}`,
      {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
        responseType: 'arraybuffer',
        timeout: 30000
      }
    );
    
    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, response.headers);
    console.log(`Audio size: ${response.data.byteLength} bytes`);
    
    res.json({
      success: true,
      status: response.status,
      audioSize: response.data.byteLength,
      contentType: response.headers['content-type'],
      test: 'Direct audio fetch successful'
    });
    
  } catch (error) {
    console.error('Audio fetch error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
    
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      status: error.response?.status,
      test: 'Direct audio fetch failed'
    });
  }
});

/**
 * Test audio processing for active bot
 * GET /api/test/process-audio
 */
router.get('/process-audio', async (req, res) => {
  try {
    const activeBots = BotPoolMonitor.getActiveBots();
    if (activeBots.length === 0) {
      return res.json({
        success: false,
        error: 'No active bots found'
      });
    }
    
    const bot = activeBots[0];
    const result = await AudioFetchService.fetchAudioForBot(bot);
    
    res.json({
      success: true,
      bot: {
        poolBotId: bot.poolBotId,
        legacyBotId: bot.legacyBotId,
        meetingUrl: bot.meetingUrl
      },
      audioFetchResult: result ? {
        hasAudio: !!result.audioBuffer,
        audioSize: result.audioBuffer?.length || 0,
        isIncremental: result.isIncremental,
        metadata: result.metadata
      } : null
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;