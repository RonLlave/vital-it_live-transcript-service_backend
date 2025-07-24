const express = require('express');
const router = express.Router();
const { asyncHandler, ValidationError } = require('../../utils/ErrorHandler');
const Logger = require('../../utils/Logger');
const axios = require('axios');
const GeminiTranscriptionService = require('../../services/GeminiTranscriptionService');
const { formatDuration } = require('../../utils/formatDuration');

/**
 * Transcribe audio and return both raw transcript and AI summary
 * POST /api/transcribe
 */
router.post('/', asyncHandler(async (req, res) => {
  const { 
    audioUrl, 
    participants = [], 
    eventId,
    meetingUrl,
    botId = 'frontend_request'
  } = req.body;

  if (!audioUrl) {
    throw new ValidationError('Audio URL is required', 'audioUrl');
  }

  Logger.info('Frontend transcription request received', {
    audioUrl,
    participantCount: participants.length,
    eventId
  });

  try {
    // Fetch audio from the provided URL
    const audioResponse = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: 200 * 1024 * 1024 // 200MB max
    });

    const audioBuffer = Buffer.from(audioResponse.data);
    
    Logger.info('Audio fetched successfully', {
      size: audioBuffer.length,
      sizeMB: (audioBuffer.length / 1024 / 1024).toFixed(2)
    });

    // Transcribe the audio
    const transcription = await GeminiTranscriptionService.transcribeAudio(
      audioBuffer,
      {
        botId,
        meetingUrl,
        participants,
        isIncremental: false
      }
    );

    // Format segments with timestamps
    const formattedSegments = (transcription.segments || []).map((segment, index) => ({
      ...segment,
      id: `segment_${index + 1}`,
      timestamp: formatDuration(segment.startTime || 0),
      startTimestamp: formatDuration(segment.startTime || 0),
      endTimestamp: formatDuration(segment.endTime || 0)
    }));

    // Generate AI summary
    const aiSummary = await GeminiTranscriptionService.generateSummary(formattedSegments);

    const response = {
      success: true,
      eventId,
      transcription: {
        segments: formattedSegments,
        fullText: transcription.fullText || formattedSegments.map(s => s.text).join(' '),
        wordCount: transcription.wordCount || 0,
        duration: transcription.duration || 0,
        detectedLanguage: transcription.detectedLanguage,
        languageConfidence: transcription.languageConfidence,
        metadata: {
          totalSegments: formattedSegments.length,
          languages: [transcription.detectedLanguage].filter(Boolean),
          lastUpdated: new Date().toISOString()
        }
      },
      aiSummary: {
        summary: aiSummary.summary,
        keyPoints: aiSummary.keyPoints || [],
        actionItems: aiSummary.actionItems || [],
        metadata: {
          generatedAt: new Date().toISOString(),
          model: 'gemini-1.5-flash'
        }
      },
      participants
    };

    res.json(response);

  } catch (error) {
    Logger.error('Frontend transcription failed:', error);
    throw error;
  }
}));

/**
 * Get only raw transcript
 * POST /api/transcribe/raw
 */
router.post('/raw', asyncHandler(async (req, res) => {
  const { 
    audioUrl, 
    participants = [], 
    eventId,
    meetingUrl,
    botId = 'frontend_request'
  } = req.body;

  if (!audioUrl) {
    throw new ValidationError('Audio URL is required', 'audioUrl');
  }

  Logger.info('Frontend raw transcription request', {
    audioUrl,
    participantCount: participants.length
  });

  try {
    // Fetch audio
    const audioResponse = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: 200 * 1024 * 1024
    });

    const audioBuffer = Buffer.from(audioResponse.data);

    // Transcribe
    const transcription = await GeminiTranscriptionService.transcribeAudio(
      audioBuffer,
      {
        botId,
        meetingUrl,
        participants,
        isIncremental: false
      }
    );

    // Format segments
    const formattedSegments = (transcription.segments || []).map((segment, index) => ({
      ...segment,
      id: `segment_${index + 1}`,
      timestamp: formatDuration(segment.startTime || 0),
      startTimestamp: formatDuration(segment.startTime || 0),
      endTimestamp: formatDuration(segment.endTime || 0)
    }));

    res.json({
      success: true,
      eventId,
      transcription: {
        segments: formattedSegments,
        fullText: transcription.fullText || formattedSegments.map(s => s.text).join(' '),
        wordCount: transcription.wordCount || 0,
        duration: transcription.duration || 0,
        detectedLanguage: transcription.detectedLanguage,
        languageConfidence: transcription.languageConfidence,
        metadata: {
          totalSegments: formattedSegments.length,
          languages: [transcription.detectedLanguage].filter(Boolean),
          lastUpdated: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    Logger.error('Raw transcription failed:', error);
    throw error;
  }
}));

/**
 * Generate AI summary from existing transcript
 * POST /api/transcribe/summary
 */
router.post('/summary', asyncHandler(async (req, res) => {
  const { 
    segments = [],
    eventId,
    meetingTitle = 'Meeting'
  } = req.body;

  if (!segments || segments.length === 0) {
    throw new ValidationError('Transcript segments are required', 'segments');
  }

  Logger.info('Frontend AI summary request', {
    segmentCount: segments.length,
    eventId
  });

  try {
    // Generate AI summary
    const aiSummary = await GeminiTranscriptionService.generateSummary(segments, {
      meetingTitle,
      includeActionItems: true
    });

    res.json({
      success: true,
      eventId,
      aiSummary: {
        summary: aiSummary.summary,
        keyPoints: aiSummary.keyPoints || [],
        actionItems: aiSummary.actionItems || [],
        metadata: {
          generatedAt: new Date().toISOString(),
          model: 'gemini-1.5-flash',
          segmentCount: segments.length
        }
      }
    });

  } catch (error) {
    Logger.error('AI summary generation failed:', error);
    throw error;
  }
}));

module.exports = router;