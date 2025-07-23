const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Logger = require('../utils/Logger');
const { errorHandler } = require('../utils/ErrorHandler');

// Import routes
const healthRoutes = require('./routes/health');
const statusRoutes = require('./routes/status');
const transcriptRoutes = require('./routes/transcripts');

/**
 * Create and configure Express server
 * @returns {Express} Configured Express app
 */
function createServer() {
  const app = express();

  // Trust proxy headers (for deployment behind reverse proxy)
  app.set('trust proxy', true);

  // Middleware for parsing JSON
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // CORS configuration
  const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // 24 hours
  };
  app.use(cors(corsOptions));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    
    // Log request
    Logger.debug(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - start;
      Logger.apiRequest(req.method, req.path, res.statusCode, duration);
    });

    next();
  });

  // Health check middleware (before auth)
  app.use('/health', healthRoutes);

  // API routes
  app.use('/api/status', statusRoutes);
  app.use('/api/transcripts', transcriptRoutes);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      service: 'Live Transcript Service',
      version: require('../../package.json').version,
      status: 'running',
      endpoints: {
        health: '/health',
        status: '/api/status',
        transcripts: '/api/transcripts',
        documentation: 'See README.md'
      }
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      path: req.path
    });
  });

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}

module.exports = { createServer };