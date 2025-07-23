const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../utils/ErrorHandler');
const Logger = require('../../utils/Logger');
const SupabaseClient = require('../../utils/SupabaseClient');

/**
 * Test Supabase connection endpoint
 * GET /test-supabase
 */
router.get('/', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  Logger.info('Testing Supabase connection...');
  
  // Test the connection
  const result = await SupabaseClient.testConnection();
  
  const response = {
    ...result,
    responseTime: `${Date.now() - startTime}ms`,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      hasUrl: !!process.env.SUPABASE_URL,
      hasKey: !!process.env.SUPABASE_KEY
    }
  };
  
  // Log the test result
  Logger.info('Supabase connection test completed', {
    success: result.success,
    responseTime: response.responseTime
  });
  
  // Return appropriate status code
  res.status(result.success ? 200 : 503).json(response);
}));

/**
 * Get Supabase configuration status
 * GET /test-supabase/status
 */
router.get('/status', (req, res) => {
  const status = {
    initialized: SupabaseClient.isReady(),
    configured: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_KEY,
    environment: {
      hasUrl: !!process.env.SUPABASE_URL,
      hasKey: !!process.env.SUPABASE_KEY,
      urlPrefix: process.env.SUPABASE_URL ? 
        process.env.SUPABASE_URL.substring(0, 30) + '...' : 
        'Not configured'
    }
  };
  
  res.json(status);
});

module.exports = router;