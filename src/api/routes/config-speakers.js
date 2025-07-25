const express = require('express');
const router = express.Router();
const { asyncHandler, ValidationError, ExternalAPIError } = require('../../utils/ErrorHandler');
const Logger = require('../../utils/Logger');
const SupabaseClient = require('../../utils/SupabaseClient');
const GeminiTranscriptionService = require('../../services/GeminiTranscriptionService');

/**
 * Configure speaker names in raw transcript
 * POST /api/config_speakers
 */
router.post('/', asyncHandler(async (req, res) => {
  const { id, participants } = req.body;

  // Validate inputs
  if (!id) {
    throw new ValidationError('ID is required', 'id');
  }

  if (!participants || !Array.isArray(participants) || participants.length === 0) {
    throw new ValidationError('Participants list is required and must be a non-empty array', 'participants');
  }

  // Check if Supabase is initialized
  if (!SupabaseClient.isReady()) {
    throw new ExternalAPIError('Supabase', 'Database service not configured');
  }

  Logger.info('Configure speakers request', {
    id,
    participantCount: participants.length,
    participants
  });

  try {
    const supabase = SupabaseClient.getClient();
    
    // Fetch the current raw transcript
    const { data: records, error: fetchError } = await supabase
      .from('meeting_bot_audio_transcript')
      .select('raw_transcript, speakers_identified_count')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        throw new ValidationError('No record found with the provided ID', 'id');
      }
      throw new ExternalAPIError('Supabase', `Failed to fetch transcript: ${fetchError.message}`);
    }

    if (!records || !records.raw_transcript) {
      throw new ValidationError('No transcript found for the provided ID', 'id');
    }

    const rawTranscript = records.raw_transcript;
    const speakersIdentifiedCount = records.speakers_identified_count || 0;

    // Validate participant count matches identified speakers
    if (participants.length !== speakersIdentifiedCount) {
      Logger.warn('Participant count mismatch', {
        provided: participants.length,
        identified: speakersIdentifiedCount
      });
    }

    // Create speaker mapping (Speaker 1 -> First participant, etc.)
    const speakerMapping = {};
    participants.forEach((name, index) => {
      speakerMapping[`Speaker ${index + 1}`] = name;
    });

    Logger.info('Speaker mapping created', speakerMapping);

    // Update segments with real names
    const updatedSegments = (rawTranscript.segments || []).map(segment => {
      const currentSpeaker = segment.speaker;
      const newSpeaker = speakerMapping[currentSpeaker] || currentSpeaker;
      
      return {
        ...segment,
        speaker: newSpeaker,
        originalSpeaker: currentSpeaker // Keep original for reference
      };
    });

    // Update the full text with new speaker names
    let updatedFullText = rawTranscript.fullText || '';
    Object.entries(speakerMapping).forEach(([genericLabel, realName]) => {
      const regex = new RegExp(`${genericLabel}:`, 'g');
      updatedFullText = updatedFullText.replace(regex, `${realName}:`);
    });

    // Create updated transcript object
    const updatedTranscript = {
      ...rawTranscript,
      segments: updatedSegments,
      fullText: updatedFullText,
      metadata: {
        ...rawTranscript.metadata,
        speakersConfigured: true,
        participantNames: participants
      }
    };

    // Generate AI summary with updated speaker names
    let aiSummary = null;
    try {
      Logger.info('Generating AI summary with updated speaker names');
      
      const summary = await GeminiTranscriptionService.generateSummary(
        {
          segments: updatedSegments,
          fullText: updatedFullText,
          wordCount: updatedTranscript.wordCount || 0,
          duration: updatedTranscript.duration || 0,
          detectedLanguage: updatedTranscript.detectedLanguage || 'unknown'
        },
        {
          participants: participants
        }
      );
      
      aiSummary = summary;
      Logger.info('AI summary generated successfully');
      
    } catch (error) {
      Logger.error('Failed to generate AI summary:', {
        error: error.message,
        stack: error.stack
      });
      // Continue without summary - we'll still update speakers
    }

    // Update the database with transcript and summary
    const updateData = {
      raw_transcript: updatedTranscript,
      is_speaker_configured: true
    };
    
    // Add AI summary if generated successfully
    if (aiSummary) {
      updateData.transcript_ai_summary = aiSummary;
    }
    
    const { data, error: updateError } = await supabase
      .from('meeting_bot_audio_transcript')
      .update(updateData)
      .eq('id', id)
      .select();

    if (updateError) {
      Logger.error('Failed to update transcript with speaker names:', {
        error: updateError.message,
        code: updateError.code
      });
      throw new ExternalAPIError('Supabase', `Failed to update transcript: ${updateError.message}`);
    }

    // Count how many segments were updated
    const updatedCount = updatedSegments.filter(
      (segment, index) => segment.speaker !== (rawTranscript.segments[index]?.speaker || '')
    ).length;

    Logger.info('Speakers configured successfully', {
      id,
      updatedSegments: updatedCount,
      totalSegments: updatedSegments.length
    });

    const response = {
      success: true,
      id,
      message: 'Speaker names configured successfully',
      result: {
        updatedSegments: updatedCount,
        totalSegments: updatedSegments.length,
        speakerMapping,
        aiSummaryGenerated: !!aiSummary
      }
    };
    
    // Include summary in response if generated
    if (aiSummary) {
      response.result.summary = {
        brief: aiSummary.summary?.brief || '',
        keyPoints: aiSummary.summary?.keyPoints || [],
        actionItems: aiSummary.summary?.actionItems || []
      };
      response.message = 'Speaker names configured and AI summary generated successfully';
    }
    
    res.json(response);

  } catch (error) {
    Logger.error('Configure speakers failed:', {
      error: error.message,
      stack: error.stack,
      id
    });
    
    throw error;
  }
}));

module.exports = router;