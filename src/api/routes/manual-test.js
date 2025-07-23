const express = require('express');
const router = express.Router();
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Logger = require('../../utils/Logger');

/**
 * Manual test for the complete audio-to-transcript pipeline
 * GET /api/manual-test/full-pipeline
 */
router.get('/full-pipeline', async (req, res) => {
  try {
    // Step 1: Get active bot info
    const apiUrl = process.env.MEETING_BOT_API_URL;
    const apiKey = process.env.MEETING_BOT_API_KEY;
    
    const poolResponse = await axios.get(
      `${apiUrl}/api/google-meet-guest/pool/active`,
      {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
      }
    );
    
    if (poolResponse.data.count === 0) {
      return res.json({ success: false, error: 'No active bots found' });
    }
    
    const bot = poolResponse.data.bots[0];
    const legacyBotId = bot.legacyBotId;
    
    // Step 2: Fetch audio
    Logger.info(`Fetching audio for bot ${bot.poolBotId} (legacy: ${legacyBotId})`);
    
    let audioData;
    try {
      const audioResponse = await axios.get(
        `${apiUrl}/api/google-meet-guest/audio-blob/${legacyBotId}`,
        {
          headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );
      
      audioData = audioResponse.data;
      Logger.info(`Fetched audio: ${audioData.byteLength} bytes`);
    } catch (audioError) {
      return res.json({
        success: false,
        step: 'audio_fetch',
        error: audioError.message,
        status: audioError.response?.status
      });
    }
    
    // Step 3: Test Gemini transcription with a small chunk
    const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!geminiKey) {
      return res.json({ success: false, error: 'Gemini API key not configured' });
    }
    
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Use first 30 seconds of audio for testing
    const testChunkSize = Math.min(audioData.byteLength, 1024 * 1024); // Max 1MB for test
    const testChunk = Buffer.from(audioData.slice(0, testChunkSize));
    
    Logger.info(`Testing transcription with ${testChunk.length} bytes`);
    
    try {
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'audio/wav',
            data: testChunk.toString('base64')
          }
        },
        {
          text: 'Transcribe this audio. Return only the transcribed text, nothing else.'
        }
      ]);
      
      const transcription = result.response.text();
      
      return res.json({
        success: true,
        bot: {
          poolBotId: bot.poolBotId,
          legacyBotId: bot.legacyBotId,
          meetingUrl: bot.meetingUrl,
          duration: bot.duration,
          participants: bot.participants
        },
        audio: {
          totalSize: audioData.byteLength,
          testChunkSize: testChunk.length,
          url: `${apiUrl}/api/google-meet-guest/audio-blob/${legacyBotId}`
        },
        transcription: {
          success: true,
          text: transcription,
          length: transcription.length
        }
      });
      
    } catch (geminiError) {
      Logger.error('Gemini transcription error:', geminiError);
      return res.json({
        success: false,
        step: 'gemini_transcription',
        error: geminiError.message,
        audioSize: testChunk.length
      });
    }
    
  } catch (error) {
    Logger.error('Full pipeline test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;