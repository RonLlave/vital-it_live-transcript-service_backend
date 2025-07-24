const { GoogleGenerativeAI } = require('@google/generative-ai');
const Logger = require('../utils/Logger');
const AudioProcessor = require('../utils/AudioProcessor');
const { ExternalAPIError, RateLimitError, withRetry } = require('../utils/ErrorHandler');

class GeminiTranscriptionService {
  constructor() {
    this.apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    this.model = process.env.GOOGLE_GEMINI_MODEL || 'gemini-1.5-flash';
    this.enableSpeakerDiarization = process.env.ENABLE_SPEAKER_DIARIZATION === 'true';
    this.languageHints = (process.env.TRANSCRIPT_LANGUAGE_HINTS || 'en').split(',');
    this.maxTranscriptLength = parseInt(process.env.MAX_TRANSCRIPT_LENGTH) || 500000;
    this.genAI = null;
    this.geminiModel = null;
    this.transcriptionStats = {
      total: 0,
      successful: 0,
      failed: 0,
      totalDuration: 0
    };
  }

  /**
   * Initialize the Gemini API client
   */
  initialize() {
    if (!this.apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.geminiModel = this.genAI.getGenerativeModel({ model: this.model });
    
    Logger.info('GeminiTranscriptionService initialized', {
      model: this.model,
      speakerDiarization: this.enableSpeakerDiarization,
      languageHints: this.languageHints
    });
  }

  /**
   * Transcribe audio buffer using Gemini
   * @param {Buffer} audioBuffer - Audio buffer to transcribe
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeAudio(audioBuffer, options = {}) {
    const {
      botId,
      meetingUrl,
      isIncremental = false,
      previousContext = null,
      participants = [],
      useGenericSpeakers = false
    } = options;

    const startTime = Date.now();
    this.transcriptionStats.total++;

    Logger.info(`🎤 Starting Gemini transcription`, {
      botId,
      audioSize: audioBuffer.length,
      audioSizeMB: (audioBuffer.length / 1024 / 1024).toFixed(2),
      isIncremental,
      meetingUrl,
      participantCount: participants.length,
      participants: participants.map(p => p.name || p.email || 'Unknown').slice(0, 5) // Log first 5 names
    });

    try {
      // Process audio for Gemini
      Logger.debug(`Processing audio for Gemini...`);
      const processedAudio = await AudioProcessor.processAudioForGemini(audioBuffer);
      const audioBase64 = AudioProcessor.audioToBase64(processedAudio);
      
      Logger.info(`Audio processed for Gemini`, {
        originalSize: audioBuffer.length,
        processedSize: processedAudio.length,
        base64Length: audioBase64.length
      });
      
      // Get audio metadata  
      Logger.debug(`Extracting audio metadata...`);
      const metadata = await AudioProcessor.getAudioMetadata(audioBuffer);
      
      Logger.info(`Audio metadata extracted`, {
        duration: metadata.duration,
        sampleRate: metadata.sampleRate,
        channels: metadata.channels,
        format: metadata.format
      });
      
      // Build transcription prompt
      const prompt = this.buildTranscriptionPrompt(isIncremental, previousContext, participants, useGenericSpeakers);
      
      Logger.debug(`Sending request to Gemini API...`);
      
      // Prepare content for Gemini
      const contents = [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: audioBase64
            }
          }
        ]
      }];

      // Call Gemini API with retry logic
      const result = await withRetry(async () => {
        Logger.info(`📡 Calling Gemini API for transcription...`);
        const response = await this.geminiModel.generateContent({ contents });
        const responseText = response.response.text();
        Logger.info(`✅ Gemini API response received`, {
          responseLength: responseText.length,
          responsePreview: responseText.substring(0, 200) + '...'
        });
        return responseText;
      }, {
        maxRetries: 3,
        delay: 2000,
        shouldRetry: (error) => {
          Logger.error(`⚠️ Gemini API error, checking if retryable:`, error.message);
          if (error.message?.includes('rate limit')) {
            throw new RateLimitError('Gemini API', 60000);
          }
          return error.message?.includes('503') || error.message?.includes('timeout');
        }
      });

      // Parse transcription response
      Logger.debug(`Parsing Gemini response...`);
      const transcription = this.parseTranscriptionResponse(result);
      
      // Post-process segments to ensure proper speaker names
      if (participants && participants.length > 0 && !useGenericSpeakers) {
        Logger.info('Normalizing speaker names', {
          participantCount: participants.length,
          participants: participants.map(p => p.name || p.email),
          originalSpeakers: [...new Set(transcription.segments.map(s => s.speaker))]
        });
        
        transcription.segments = this.normalizeSpeakerNames(
          transcription.segments, 
          participants
        );
        
        Logger.info('Speaker names normalized', {
          normalizedSpeakers: [...new Set(transcription.segments.map(s => s.speaker))]
        });
      }
      
      // Add metadata
      transcription.metadata = {
        botId,
        meetingUrl,
        duration: metadata.duration,
        processingTime: Date.now() - startTime,
        isIncremental,
        timestamp: new Date().toISOString()
      };

      this.transcriptionStats.successful++;
      this.transcriptionStats.totalDuration += (Date.now() - startTime);
      
      Logger.info(`✨ Transcription completed successfully`, {
        botId,
        segments: transcription.segments?.length || 0,
        wordCount: transcription.wordCount || 0,
        language: transcription.detectedLanguage || 'unknown',
        confidence: transcription.languageConfidence || 0,
        processingTime: Date.now() - startTime
      });

      Logger.transcriptionMetric(
        botId,
        Date.now() - startTime,
        transcription.wordCount,
        transcription.languageConfidence
      );

      return transcription;

    } catch (error) {
      this.transcriptionStats.failed++;
      
      if (error instanceof RateLimitError) {
        throw error;
      }
      
      Logger.error('Transcription failed:', error);
      throw new ExternalAPIError(
        'Gemini API',
        `Transcription failed: ${error.message}`
      );
    }
  }

  /**
   * Build transcription prompt for Gemini
   * @param {boolean} isIncremental - Whether this is incremental transcription
   * @param {Object} previousContext - Previous transcription context
   * @param {Array} participants - List of meeting participants
   * @param {boolean} useGenericSpeakers - Whether to use generic speaker labels
   * @returns {string} Prompt
   */
  buildTranscriptionPrompt(isIncremental, previousContext, participants = [], useGenericSpeakers = false) {
    let prompt;
    
    if (useGenericSpeakers) {
      // Generic speaker prompt for raw transcripts
      prompt = `This is an audio file. Transcribe it and intelligently identify different speakers.

Transcribe the audio and format the response as JSON with this exact structure:
{
  "detectedLanguage": "language code (e.g., 'en', 'de', 'es')",
  "languageConfidence": confidence score 0-1,
  "alternativeLanguages": [{"language": "code", "confidence": score}],
  "segments": [
    {
      "speaker": "Speaker 1",
      "text": "Transcribed text",
      "startTime": start time in seconds,
      "endTime": end time in seconds,
      "confidence": confidence score 0-1
    }
  ],
  "fullText": "Complete transcription as plain text",
  "wordCount": total word count
}

CRITICAL RULES:
1. Identify different speakers based on voice characteristics
2. Use consistent labels: "Speaker 1", "Speaker 2", "Speaker 3", etc.
3. The same speaker should always have the same label throughout the transcript
4. Auto-detect language from: ${this.languageHints.join(', ')}
5. Include accurate timestamps for each segment
6. Be smart about speaker detection - if it's clearly the same voice, use the same speaker label`;

    } else {
      // Use participant names
      const participantNames = participants
        .map(p => p.name || p.email || 'Unknown')
        .filter(name => name !== 'Unknown');
      
      const speakerList = participantNames.length > 0 
        ? participantNames.join(', ')
        : 'Unknown';
      
      prompt = `This is an audio file, and use the speakers with names of ${speakerList}.

Transcribe the audio and format the response as JSON with this exact structure:
{
  "detectedLanguage": "language code (e.g., 'en', 'de', 'es')",
  "languageConfidence": confidence score 0-1,
  "alternativeLanguages": [{"language": "code", "confidence": score}],
  "segments": [
    {
      "speaker": "Use ONLY these names: ${speakerList}",
      "text": "Transcribed text",
      "startTime": start time in seconds,
      "endTime": end time in seconds,
      "confidence": confidence score 0-1
    }
  ],
  "fullText": "Complete transcription as plain text",
  "wordCount": total word count
}

CRITICAL RULES:
1. For the "speaker" field in segments, you MUST use ONLY these names: ${speakerList}
2. Do NOT use "Unknown", "Speaker 1", "Speaker 2", or any generic labels
3. Auto-detect language from: ${this.languageHints.join(', ')}
4. Include accurate timestamps for each segment`;

      if (participantNames.length === 1) {
        prompt += `\n\nSince there is only one participant (${participantNames[0]}), ALL segments must have "speaker": "${participantNames[0]}"`;
      } else if (participantNames.length > 1) {
        prompt += `\n\nMultiple participants detected. Match voices and use ONLY these names in the speaker field: ${speakerList}`;
      }
    }

    if (isIncremental && previousContext) {
      prompt += `\n\nThis is a continuation. Previous context:
- Last speaker: ${previousContext.lastSpeaker}
- Duration so far: ${previousContext.totalDuration}s
- Speakers: ${previousContext.speakers.join(', ')}`;
    }

    prompt += '\n\nReturn ONLY valid JSON, no markdown or extra text.';

    return prompt;
  }

  /**
   * Parse transcription response from Gemini
   * @param {string} responseText - Response text from Gemini
   * @returns {Object} Parsed transcription
   */
  parseTranscriptionResponse(responseText) {
    try {
      // Clean response text (remove markdown if present)
      const cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleanedText);
      
      // Validate required fields
      if (!parsed.segments || !Array.isArray(parsed.segments)) {
        throw new Error('Invalid transcription format: missing segments');
      }

      // Calculate word count if not provided
      if (!parsed.wordCount) {
        parsed.wordCount = parsed.fullText ? 
          parsed.fullText.split(/\s+/).filter(word => word.length > 0).length : 0;
      }

      // Ensure all required fields exist
      return {
        detectedLanguage: parsed.detectedLanguage || 'unknown',
        languageConfidence: parsed.languageConfidence || 0,
        alternativeLanguages: parsed.alternativeLanguages || [],
        segments: parsed.segments.map(segment => ({
          speaker: segment.speaker || 'Unknown',
          text: segment.text || '',
          startTime: segment.startTime || 0,
          endTime: segment.endTime || 0,
          confidence: segment.confidence || 0
        })),
        fullText: parsed.fullText || this.combineSegmentsToText(parsed.segments),
        wordCount: parsed.wordCount
      };

    } catch (error) {
      Logger.error('Failed to parse transcription response:', {
        error: error.message,
        response: responseText.substring(0, 200)
      });

      // Fallback: try to extract any text content
      const fallbackText = this.extractFallbackText(responseText);
      return {
        detectedLanguage: 'unknown',
        languageConfidence: 0,
        alternativeLanguages: [],
        segments: [{
          speaker: 'Unknown',
          text: fallbackText,
          startTime: 0,
          endTime: 0,
          confidence: 0
        }],
        fullText: fallbackText,
        wordCount: fallbackText.split(/\s+/).filter(word => word.length > 0).length
      };
    }
  }

  /**
   * Combine segments into full text
   * @param {Array} segments - Transcript segments
   * @returns {string} Combined text
   */
  combineSegmentsToText(segments) {
    return segments
      .map(segment => segment.text)
      .filter(text => text && text.trim())
      .join(' ');
  }

  /**
   * Extract fallback text from response
   * @param {string} responseText - Raw response text
   * @returns {string} Extracted text
   */
  extractFallbackText(responseText) {
    // Try to extract any meaningful text
    const lines = responseText.split('\n');
    const textLines = lines.filter(line => 
      line.trim() && 
      !line.includes('{') && 
      !line.includes('}') &&
      !line.includes('"')
    );
    
    return textLines.join(' ').trim() || 'Transcription failed';
  }

  /**
   * Transcribe long audio in chunks
   * @param {Buffer} audioBuffer - Large audio buffer
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} Combined transcription
   */
  async transcribeLongAudio(audioBuffer, options = {}) {
    const chunks = await AudioProcessor.splitAudioIntoChunks(audioBuffer, 300); // 5-minute chunks
    Logger.info(`Splitting long audio into ${chunks.length} chunks for transcription`);

    const transcriptions = [];
    let previousContext = null;

    for (const chunk of chunks) {
      try {
        const transcription = await this.transcribeAudio(chunk.buffer, {
          ...options,
          isIncremental: chunk.index > 0,
          previousContext
        });

        // Adjust timestamps based on chunk position
        transcription.segments.forEach(segment => {
          segment.startTime += chunk.startTime;
          segment.endTime += chunk.startTime;
        });

        transcriptions.push(transcription);

        // Update context for next chunk
        previousContext = {
          lastSpeaker: transcription.segments[transcription.segments.length - 1]?.speaker,
          totalDuration: chunk.endTime,
          speakers: [...new Set(transcription.segments.map(s => s.speaker))]
        };

      } catch (error) {
        Logger.error(`Failed to transcribe chunk ${chunk.index}:`, error);
        if (error instanceof RateLimitError) {
          throw error;
        }
      }
    }

    // Combine all transcriptions
    return this.combineTranscriptions(transcriptions);
  }

  /**
   * Combine multiple transcriptions
   * @param {Array} transcriptions - Array of transcriptions
   * @returns {Object} Combined transcription
   */
  combineTranscriptions(transcriptions) {
    if (transcriptions.length === 0) {
      throw new Error('No transcriptions to combine');
    }

    // Combine all segments
    const allSegments = transcriptions.flatMap(t => t.segments);
    
    // Determine primary language
    const languageVotes = {};
    transcriptions.forEach(t => {
      languageVotes[t.detectedLanguage] = (languageVotes[t.detectedLanguage] || 0) + 1;
    });
    const primaryLanguage = Object.entries(languageVotes)
      .sort((a, b) => b[1] - a[1])[0][0];

    // Calculate average confidence
    const avgConfidence = transcriptions.reduce((sum, t) => sum + t.languageConfidence, 0) / 
      transcriptions.length;

    return {
      detectedLanguage: primaryLanguage,
      languageConfidence: avgConfidence,
      alternativeLanguages: transcriptions[0].alternativeLanguages || [],
      segments: allSegments,
      fullText: this.combineSegmentsToText(allSegments),
      wordCount: allSegments.reduce((sum, s) => 
        sum + s.text.split(/\s+/).filter(w => w.length > 0).length, 0
      )
    };
  }

  /**
   * Get transcription statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.transcriptionStats,
      averageDuration: this.transcriptionStats.total > 0 ? 
        Math.round(this.transcriptionStats.totalDuration / this.transcriptionStats.total) : 0,
      successRate: this.transcriptionStats.total > 0 ?
        (this.transcriptionStats.successful / this.transcriptionStats.total) : 0
    };
  }

  /**
   * Generate AI summary from transcript
   * @param {Object} transcript - Full transcript object
   * @param {Object} meetingInfo - Meeting information (participants, duration, etc.)
   * @returns {Promise<Object>} AI-generated summary
   */
  async generateSummary(transcript, meetingInfo = {}) {
    if (!this.geminiModel) {
      throw new Error('Gemini model not initialized');
    }

    const startTime = Date.now();

    try {
      // Prepare context for summary
      const participants = meetingInfo.participants || [];
      const meetingDuration = transcript.duration || 0;
      const languageInfo = transcript.detectedLanguage || 'unknown';
      
      // Build summary prompt
      const prompt = `
Analyze this meeting transcript and provide a comprehensive summary.

Meeting Information:
- Duration: ${this.formatDuration(meetingDuration)}
- Language: ${languageInfo}
- Participants: ${participants.length > 0 ? participants.join(', ') : 'Unknown'}
- Total Words: ${transcript.wordCount || 0}

Transcript:
${transcript.fullText || transcript.segments.map(s => `${s.speaker}: ${s.text}`).join('\n')}

Provide a JSON response with the following structure:
{
  "summary": {
    "brief": "A 2-3 sentence executive summary of the meeting",
    "keyPoints": ["Array of 3-5 main discussion points"],
    "decisions": ["Array of decisions made during the meeting"],
    "actionItems": [
      {
        "task": "Description of the action item",
        "assignee": "Person responsible (if mentioned)",
        "deadline": "Deadline if mentioned, null otherwise"
      }
    ],
    "topics": ["Array of main topics discussed"],
    "sentiment": "Overall meeting sentiment (positive/neutral/negative)",
    "nextSteps": ["Array of planned next steps"]
  },
  "insights": {
    "participationRate": {
      "speakerName": "percentage of speaking time"
    },
    "mostDiscussedTopics": ["Top 3 topics by mention frequency"],
    "meetingType": "Type of meeting (standup/planning/review/discussion/other)",
    "effectiveness": "Meeting effectiveness rating (high/medium/low) with brief reason"
  }
}

IMPORTANT: Return ONLY valid JSON, no additional text or markdown.`;

      // Call Gemini API
      const result = await withRetry(async () => {
        const response = await this.geminiModel.generateContent(prompt);
        return response.response.text();
      }, {
        maxRetries: 2,
        delay: 1000
      });

      // Parse response
      const summary = this.parseSummaryResponse(result);
      
      // Add metadata
      summary.metadata = {
        generatedAt: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        transcriptSegments: transcript.segments?.length || 0,
        meetingDuration: meetingDuration
      };

      Logger.info('AI summary generated successfully', {
        processingTime: summary.metadata.processingTime,
        wordCount: transcript.wordCount
      });

      return summary;

    } catch (error) {
      Logger.error('Failed to generate AI summary:', error);
      throw new ExternalAPIError(
        'Gemini API',
        `Summary generation failed: ${error.message}`
      );
    }
  }

  /**
   * Parse summary response from Gemini
   * @param {string} responseText - Response text from Gemini
   * @returns {Object} Parsed summary
   */
  parseSummaryResponse(responseText) {
    try {
      // Clean response text
      const cleanedText = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleanedText);
      
      // Ensure all required fields exist with defaults
      return {
        summary: {
          brief: parsed.summary?.brief || 'Summary not available',
          keyPoints: parsed.summary?.keyPoints || [],
          decisions: parsed.summary?.decisions || [],
          actionItems: parsed.summary?.actionItems || [],
          topics: parsed.summary?.topics || [],
          sentiment: parsed.summary?.sentiment || 'neutral',
          nextSteps: parsed.summary?.nextSteps || []
        },
        insights: {
          participationRate: parsed.insights?.participationRate || {},
          mostDiscussedTopics: parsed.insights?.mostDiscussedTopics || [],
          meetingType: parsed.insights?.meetingType || 'other',
          effectiveness: parsed.insights?.effectiveness || 'medium'
        }
      };
    } catch (error) {
      Logger.error('Failed to parse summary response:', error);
      
      // Return default summary structure
      return {
        summary: {
          brief: 'Failed to generate summary',
          keyPoints: [],
          decisions: [],
          actionItems: [],
          topics: [],
          sentiment: 'neutral',
          nextSteps: []
        },
        insights: {
          participationRate: {},
          mostDiscussedTopics: [],
          meetingType: 'other',
          effectiveness: 'unknown'
        }
      };
    }
  }

  /**
   * Format duration helper
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   */
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Normalize speaker names to match provided participants
   * @param {Array} segments - Transcript segments
   * @param {Array} participants - List of participants
   * @returns {Array} Normalized segments
   */
  normalizeSpeakerNames(segments, participants) {
    if (!segments || segments.length === 0) return segments;
    if (!participants || participants.length === 0) return segments;
    
    // Extract participant names
    const participantNames = participants.map(p => p.name || p.email || 'Unknown');
    
    // For single participant, always use their name
    if (participants.length === 1) {
      const participantName = participantNames[0];
      return segments.map(segment => ({
        ...segment,
        speaker: participantName
      }));
    }
    
    // For multiple participants, replace generic labels
    return segments.map(segment => {
      const speaker = segment.speaker || 'Unknown';
      
      // Check if speaker is a generic label
      if (speaker === 'Unknown' || 
          speaker === 'Speaker' ||
          speaker.match(/^Speaker \d+$/)) {
        
        // Try to find a participant name that's not already heavily used
        // This is a simple heuristic - in production you'd want voice matching
        const speakerCounts = {};
        segments.forEach(s => {
          speakerCounts[s.speaker] = (speakerCounts[s.speaker] || 0) + 1;
        });
        
        // Find the least used participant name
        let leastUsedName = participantNames[0];
        let minCount = Infinity;
        
        participantNames.forEach(name => {
          const count = speakerCounts[name] || 0;
          if (count < minCount) {
            minCount = count;
            leastUsedName = name;
          }
        });
        
        return {
          ...segment,
          speaker: leastUsedName
        };
      }
      
      // Keep the speaker name if it matches a participant
      if (participantNames.includes(speaker)) {
        return segment;
      }
      
      // Otherwise, try fuzzy matching (e.g., partial name match)
      const matchedName = participantNames.find(name => 
        name.toLowerCase().includes(speaker.toLowerCase()) ||
        speaker.toLowerCase().includes(name.toLowerCase())
      );
      
      if (matchedName) {
        return {
          ...segment,
          speaker: matchedName
        };
      }
      
      // Default to first participant if no match
      return {
        ...segment,
        speaker: participantNames[0]
      };
    });
  }
}

module.exports = new GeminiTranscriptionService();