const express = require('express');
const router = express.Router();
const TranscriptStreamService = require('../../services/TranscriptStreamService');

/**
 * Test formatDuration
 * GET /api/test/format-duration
 */
router.get('/format-duration', (req, res) => {
  try {
    // Test the static method
    const formatted = TranscriptStreamService.formatDuration(3661); // 1 hour, 1 minute, 1 second
    
    res.json({
      success: true,
      test: {
        input: 3661,
        output: formatted,
        expected: '01:01:01'
      },
      method: 'TranscriptStreamService.formatDuration (static)'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * Test audio fetch directly
 * GET /api/test/audio-fetch/:legacyBotId
 */
router.get('/audio-fetch/:legacyBotId', async (req, res) => {
  const { legacyBotId } = req.params;
  const axios = require('axios');
  
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
    
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      status: error.response?.status,
      test: 'Direct audio fetch failed'
    });
  }
});

module.exports = router;