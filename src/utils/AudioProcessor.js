const ffmpeg = require('fluent-ffmpeg');
const { Readable } = require('stream');
const Logger = require('./Logger');
const { AppError } = require('./ErrorHandler');

class AudioProcessor {
  constructor() {
    this.sampleRate = parseInt(process.env.GEMINI_AUDIO_SAMPLE_RATE) || 16000;
    this.audioFormat = process.env.AUDIO_FORMAT || 'WAV';
  }

  /**
   * Convert audio buffer to format compatible with Gemini API
   * @param {Buffer} audioBuffer - Raw audio buffer
   * @param {Object} options - Processing options
   * @returns {Promise<Buffer>} - Processed audio buffer
   */
  async processAudioForGemini(audioBuffer, options = {}) {
    const {
      inputFormat,
      outputFormat = 'wav',
      channels = 1,
      bitrate = '128k'
    } = options;

    return new Promise((resolve, reject) => {
      const chunks = [];
      const inputStream = new Readable();
      inputStream.push(audioBuffer);
      inputStream.push(null);

      // Create ffmpeg command
      const command = ffmpeg(inputStream);
      
      // Only specify input format if provided, otherwise let ffmpeg auto-detect
      if (inputFormat) {
        command.inputFormat(inputFormat);
      }
      
      command
        .audioChannels(channels)
        .audioFrequency(this.sampleRate)
        .audioBitrate(bitrate)
        .outputFormat(outputFormat)
        .on('error', (err) => {
          Logger.error('Audio processing error:', {
            error: err.message,
            inputFormat,
            outputFormat,
            command: err.ffmpegCommand || 'N/A'
          });
          reject(new AppError(`Failed to process audio: ffmpeg exited with code ${err.code || 'unknown'}: ${err.message}`, 500));
        })
        .on('end', () => {
          const processedBuffer = Buffer.concat(chunks);
          Logger.debug('Audio processing completed', {
            originalSize: audioBuffer.length,
            processedSize: processedBuffer.length,
            sampleRate: this.sampleRate
          });
          resolve(processedBuffer);
        })
        .pipe()
        .on('data', (chunk) => {
          chunks.push(chunk);
        });
    });
  }

  /**
   * Extract audio metadata
   * @param {Buffer} audioBuffer - Audio buffer
   * @returns {Promise<Object>} - Audio metadata
   */
  async getAudioMetadata(audioBuffer) {
    return new Promise((resolve, reject) => {
      const inputStream = new Readable();
      inputStream.push(audioBuffer);
      inputStream.push(null);

      ffmpeg.ffprobe(inputStream, (err, metadata) => {
        if (err) {
          Logger.error('Failed to extract audio metadata:', {
            error: err.message,
            code: err.code
          });
          
          // If ffprobe fails, try to provide basic metadata
          // This prevents complete failure when metadata extraction fails
          if (audioBuffer && audioBuffer.length > 0) {
            Logger.warn('Falling back to basic metadata');
            resolve({
              duration: 0, // Duration unknown
              bitrate: 0,
              sampleRate: 16000, // Default sample rate
              channels: 1,
              codec: 'unknown',
              format: 'unknown',
              size: audioBuffer.length
            });
            return;
          }
          
          reject(new AppError(`Failed to get audio metadata: ${err.message}`, 500));
          return;
        }

        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        if (!audioStream) {
          reject(new AppError('No audio stream found in file', 400));
          return;
        }

        resolve({
          duration: parseFloat(metadata.format.duration) || 0,
          bitrate: parseInt(metadata.format.bit_rate) || 0,
          sampleRate: audioStream.sample_rate || 0,
          channels: audioStream.channels || 0,
          codec: audioStream.codec_name || 'unknown',
          format: metadata.format.format_name || 'unknown',
          size: parseInt(metadata.format.size) || audioBuffer.length
        });
      });
    });
  }

  /**
   * Split audio into chunks for processing
   * @param {Buffer} audioBuffer - Audio buffer
   * @param {number} chunkDuration - Duration of each chunk in seconds
   * @returns {Promise<Array>} - Array of audio chunks
   */
  async splitAudioIntoChunks(audioBuffer, chunkDuration = 300) { // 5 minutes default
    const metadata = await this.getAudioMetadata(audioBuffer);
    const totalDuration = metadata.duration;
    const chunks = [];

    if (totalDuration <= chunkDuration) {
      return [{ buffer: audioBuffer, startTime: 0, endTime: totalDuration }];
    }

    const numChunks = Math.ceil(totalDuration / chunkDuration);
    
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDuration;
      const endTime = Math.min((i + 1) * chunkDuration, totalDuration);
      
      try {
        const chunk = await this.extractAudioSegment(audioBuffer, startTime, endTime);
        chunks.push({
          buffer: chunk,
          startTime,
          endTime,
          index: i
        });
      } catch (error) {
        Logger.error(`Failed to extract chunk ${i}:`, error);
        throw error;
      }
    }

    return chunks;
  }

  /**
   * Extract a segment from audio buffer
   * @param {Buffer} audioBuffer - Source audio buffer
   * @param {number} startTime - Start time in seconds
   * @param {number} endTime - End time in seconds
   * @returns {Promise<Buffer>} - Extracted audio segment
   */
  async extractAudioSegment(audioBuffer, startTime, endTime) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const inputStream = new Readable();
      inputStream.push(audioBuffer);
      inputStream.push(null);

      ffmpeg(inputStream)
        .setStartTime(startTime)
        .setDuration(endTime - startTime)
        .audioChannels(1)
        .audioFrequency(this.sampleRate)
        .outputFormat('wav')
        .on('error', (err) => {
          reject(new AppError(`Failed to extract audio segment: ${err.message}`, 500));
        })
        .on('end', () => {
          resolve(Buffer.concat(chunks));
        })
        .pipe()
        .on('data', (chunk) => {
          chunks.push(chunk);
        });
    });
  }

  /**
   * Convert audio buffer to base64 for API transmission
   * @param {Buffer} audioBuffer - Audio buffer
   * @returns {string} - Base64 encoded audio
   */
  audioToBase64(audioBuffer) {
    return audioBuffer.toString('base64');
  }

  /**
   * Calculate audio fingerprint for deduplication
   * @param {Buffer} audioBuffer - Audio buffer
   * @returns {string} - Audio fingerprint
   */
  calculateAudioFingerprint(audioBuffer) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(audioBuffer).digest('hex');
  }

  /**
   * Check if audio buffer has actual content (not silence)
   * @param {Buffer} audioBuffer - Audio buffer
   * @returns {Promise<boolean>} - True if audio has content
   */
  async hasAudioContent(audioBuffer) {
    try {
      const metadata = await this.getAudioMetadata(audioBuffer);
      // Simple check based on size and duration
      // More sophisticated silence detection could be added
      return metadata.duration > 0 && audioBuffer.length > 1000;
    } catch (error) {
      Logger.error('Failed to check audio content:', error);
      return false;
    }
  }

  /**
   * Detect audio format from URL or buffer
   * @param {string} url - Audio URL (optional)
   * @param {Buffer} audioBuffer - Audio buffer (optional)
   * @returns {string|null} - Detected format or null
   */
  detectAudioFormat(url, audioBuffer) {
    // First try to detect from URL extension
    if (url) {
      const match = url.match(/\.([a-zA-Z0-9]+)(\?|$)/);
      if (match && match[1]) {
        const format = match[1].toLowerCase();
        Logger.debug('Detected format from URL:', { url, format });
        return format;
      }
    }

    // Try to detect from buffer magic numbers
    if (audioBuffer && audioBuffer.length > 4) {
      // MP3 magic numbers
      if (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0) {
        return 'mp3';
      }
      // WAV magic numbers
      if (audioBuffer[0] === 0x52 && audioBuffer[1] === 0x49 && 
          audioBuffer[2] === 0x46 && audioBuffer[3] === 0x46) {
        return 'wav';
      }
      // M4A/AAC magic numbers
      if (audioBuffer[4] === 0x66 && audioBuffer[5] === 0x74 && 
          audioBuffer[6] === 0x79 && audioBuffer[7] === 0x70) {
        return 'm4a';
      }
    }

    return null;
  }
}

module.exports = new AudioProcessor();