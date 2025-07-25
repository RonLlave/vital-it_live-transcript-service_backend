const express = require('express');
const router = express.Router();
const { asyncHandler, ValidationError, ExternalAPIError } = require('../../utils/ErrorHandler');
const Logger = require('../../utils/Logger');
const axios = require('axios');
const GeminiTranscriptionService = require('../../services/GeminiTranscriptionService');
const { formatDuration } = require('../../utils/formatDuration');
const SupabaseClient = require('../../utils/SupabaseClient');

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
        isIncremental: false,
        audioUrl  // Pass for format detection
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

    // Transcribe with generic speaker labels
    const transcription = await GeminiTranscriptionService.transcribeAudio(
      audioBuffer,
      {
        botId,
        meetingUrl,
        participants,
        isIncremental: false,
        useGenericSpeakers: true,  // Use Speaker 1, Speaker 2, etc.
        audioUrl  // Pass for format detection
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
 * Generate AI summary from audio URL
 * POST /api/transcribe/summary
 */
router.post('/summary', asyncHandler(async (req, res) => {
  const { 
    audioUrl,
    participants = [],
    eventId,
    meetingUrl,
    meetingTitle = 'Meeting',
    botId = 'frontend_request'
  } = req.body;

  if (!audioUrl) {
    throw new ValidationError('Audio URL is required', 'audioUrl');
  }

  Logger.info('Frontend AI summary request', {
    audioUrl,
    participantCount: participants.length,
    eventId
  });

  try {
    // Fetch audio from URL
    const audioResponse = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: 200 * 1024 * 1024 // 200MB max
    });

    const audioBuffer = Buffer.from(audioResponse.data);
    
    Logger.info('Audio fetched for summary', {
      size: audioBuffer.length,
      sizeMB: (audioBuffer.length / 1024 / 1024).toFixed(2)
    });

    // First transcribe the audio
    const transcription = await GeminiTranscriptionService.transcribeAudio(
      audioBuffer,
      {
        botId,
        meetingUrl,
        participants,
        isIncremental: false,
        audioUrl  // Pass for format detection
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

    // Prepare transcript object for summary
    const transcript = {
      segments: formattedSegments,
      fullText: transcription.fullText || formattedSegments.map(s => `${s.speaker}: ${s.text}`).join('\n'),
      wordCount: transcription.wordCount || 0,
      duration: transcription.metadata?.duration || 0,
      detectedLanguage: transcription.detectedLanguage
    };

    // Extract speaker names from participants
    const speakerNames = participants.map(p => p.name || p.email || 'Unknown');
    
    // Generate AI summary
    const aiSummary = await GeminiTranscriptionService.generateSummary(transcript, {
      meetingTitle,
      participants: speakerNames,
      includeActionItems: true
    });

    res.json({
      success: true,
      eventId,
      aiSummary: {
        summary: aiSummary.summary,
        keyPoints: aiSummary.summary?.keyPoints || [],
        actionItems: aiSummary.summary?.actionItems || [],
        decisions: aiSummary.summary?.decisions || [],
        topics: aiSummary.summary?.topics || [],
        sentiment: aiSummary.summary?.sentiment || 'neutral',
        nextSteps: aiSummary.summary?.nextSteps || [],
        insights: aiSummary.insights || {},
        metadata: {
          generatedAt: new Date().toISOString(),
          model: 'gemini-1.5-flash',
          segmentCount: formattedSegments.length,
          duration: transcript.duration,
          wordCount: transcript.wordCount,
          detectedLanguage: transcript.detectedLanguage
        }
      }
    });

  } catch (error) {
    Logger.error('AI summary generation failed:', {
      error: error.message,
      stack: error.stack,
      eventId,
      audioUrl
    });
    
    // Provide a more specific error response
    if (error.message?.includes('Gemini model not initialized')) {
      throw new ExternalAPIError('Gemini API', 'AI service not properly initialized');
    }
    
    throw error;
  }
}));

/**
 * Transcribe audio from public URL and save to Supabase
 * POST /api/transcribe/raw_save
 */
router.post('/raw_save', asyncHandler(async (req, res) => {
  const { id, publicUrl } = req.body;

  // Validate inputs
  if (!id) {
    throw new ValidationError('ID is required', 'id');
  }

  if (!publicUrl) {
    throw new ValidationError('Public URL is required', 'publicUrl');
  }

  // Check if Supabase is initialized
  if (!SupabaseClient.isReady()) {
    throw new ExternalAPIError('Supabase', 'Database service not configured');
  }

  Logger.info('Raw transcript save request', {
    id,
    publicUrl
  });

  try {
    // Fetch audio from public URL
    const audioResponse = await axios.get(publicUrl, {
      responseType: 'arraybuffer',
      timeout: 60000, // 60 seconds for larger files
      maxContentLength: 500 * 1024 * 1024 // 500MB max
    });

    const audioBuffer = Buffer.from(audioResponse.data);
    
    Logger.info('Audio fetched from public URL', {
      size: audioBuffer.length,
      sizeMB: (audioBuffer.length / 1024 / 1024).toFixed(2)
    });

    // Transcribe with generic speaker labels
    const transcription = await GeminiTranscriptionService.transcribeAudio(
      audioBuffer,
      {
        botId: `supabase_${id}`,
        isIncremental: false,
        useGenericSpeakers: true,  // Use Speaker 1, Speaker 2, etc.
        audioUrl: publicUrl  // Pass the URL for format detection
      }
    );

    // Format the transcript for storage
    const rawTranscript = {
      segments: (transcription.segments || []).map((segment, index) => ({
        id: index + 1,
        speaker: segment.speaker,
        text: segment.text,
        startTime: segment.startTime || 0,
        endTime: segment.endTime || 0,
        confidence: segment.confidence || 0
      })),
      fullText: transcription.fullText || '',
      wordCount: transcription.wordCount || 0,
      duration: transcription.metadata?.duration || 0,
      detectedLanguage: transcription.detectedLanguage || 'unknown',
      languageConfidence: transcription.languageConfidence || 0,
      metadata: {
        transcribedAt: new Date().toISOString(),
        audioUrl: publicUrl,
        model: 'gemini-1.5-flash'
      }
    };

    // Count unique speakers
    const uniqueSpeakers = new Set(
      (transcription.segments || [])
        .map(segment => segment.speaker)
        .filter(speaker => speaker && speaker !== 'Unknown')
    );
    const speakersIdentifiedCount = uniqueSpeakers.size;

    // Update the row in Supabase
    const supabase = SupabaseClient.getClient();
    const { data, error } = await supabase
      .from('meeting_bot_audio_transcript')
      .update({
        raw_transcript: rawTranscript,
        speakers_identified_count: speakersIdentifiedCount,
        transcribed_at: new Date().toISOString(),
        status: 'completed'
      })
      .eq('id', id)
      .select();

    if (error) {
      Logger.error('Failed to save transcript to Supabase:', {
        error: error.message,
        code: error.code,
        details: error.details
      });
      throw new ExternalAPIError('Supabase', `Failed to save transcript: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new ValidationError('No record found with the provided ID', 'id');
    }

    Logger.info('Transcript saved successfully', {
      id,
      segmentCount: rawTranscript.segments.length,
      wordCount: rawTranscript.wordCount,
      speakersIdentifiedCount
    });

    res.json({
      success: true,
      id,
      message: 'Transcript saved successfully',
      transcript: {
        segmentCount: rawTranscript.segments.length,
        wordCount: rawTranscript.wordCount,
        duration: rawTranscript.duration,
        detectedLanguage: rawTranscript.detectedLanguage,
        speakersIdentifiedCount: speakersIdentifiedCount
      }
    });

  } catch (error) {
    Logger.error('Raw transcript save failed:', {
      error: error.message,
      stack: error.stack,
      id,
      publicUrl
    });
    
    // Update status to failed in Supabase
    try {
      const supabase = SupabaseClient.getClient();
      await supabase
        .from('meeting_bot_audio_transcript')
        .update({
          status: 'failed',
          error_message: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
    } catch (updateError) {
      Logger.error('Failed to update error status:', updateError);
    }
    
    throw error;
  }
}));

module.exports = router;