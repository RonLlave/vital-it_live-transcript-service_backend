const { createClient } = require('@supabase/supabase-js');
const Logger = require('./Logger');

class SupabaseClient {
  constructor() {
    this.supabase = null;
    this.isInitialized = false;
  }

  /**
   * Initialize Supabase client
   */
  initialize() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      Logger.warn('Supabase credentials not configured');
      return false;
    }

    try {
      this.supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false
        }
      });
      
      this.isInitialized = true;
      Logger.info('Supabase client initialized successfully');
      return true;
    } catch (error) {
      Logger.error('Failed to initialize Supabase client:', error);
      return false;
    }
  }

  /**
   * Test Supabase connection
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Supabase client not initialized',
        configured: false
      };
    }

    try {
      // Try to query the database (you can adjust this based on your schema)
      // For now, we'll just check if we can make a basic query
      const { data, error } = await this.supabase
        .from('_supabase_realtime')
        .select('*')
        .limit(1);

      if (error) {
        // If the table doesn't exist, try another approach
        if (error.code === '42P01') {
          // Table doesn't exist, but connection works
          return {
            success: true,
            message: 'Connected to Supabase successfully',
            configured: true,
            details: {
              url: process.env.SUPABASE_URL,
              timestamp: new Date().toISOString()
            }
          };
        }
        
        return {
          success: false,
          error: error.message,
          configured: true,
          details: {
            code: error.code,
            hint: error.hint
          }
        };
      }

      return {
        success: true,
        message: 'Connected to Supabase successfully',
        configured: true,
        details: {
          url: process.env.SUPABASE_URL,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      Logger.error('Supabase connection test failed:', error);
      return {
        success: false,
        error: error.message,
        configured: true
      };
    }
  }

  /**
   * Get Supabase client instance
   * @returns {Object|null} Supabase client
   */
  getClient() {
    if (!this.isInitialized) {
      Logger.warn('Attempting to use Supabase client before initialization');
      return null;
    }
    return this.supabase;
  }

  /**
   * Check if Supabase is configured and ready
   * @returns {boolean} Ready status
   */
  isReady() {
    return this.isInitialized && this.supabase !== null;
  }
}

module.exports = new SupabaseClient();