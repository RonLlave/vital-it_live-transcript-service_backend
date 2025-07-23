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

module.exports = router;