const Logger = require('./Logger');

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400);
    this.field = field;
    this.type = 'ValidationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource) {
    super(`${resource} not found`, 404);
    this.type = 'NotFoundError';
  }
}

class ExternalAPIError extends AppError {
  constructor(service, message, statusCode = 503) {
    super(`External API Error (${service}): ${message}`, statusCode);
    this.service = service;
    this.type = 'ExternalAPIError';
  }
}

class RateLimitError extends AppError {
  constructor(service, retryAfter = null) {
    super(`Rate limit exceeded for ${service}`, 429);
    this.service = service;
    this.retryAfter = retryAfter;
    this.type = 'RateLimitError';
  }
}

const errorHandler = (err, req, res, next) => {
  let error = err;
  
  // If error is not operational, convert it
  if (!(error instanceof AppError)) {
    error = new AppError(
      err.message || 'Internal server error',
      err.statusCode || 500,
      false
    );
  }
  
  // Log error
  Logger.error(`Error occurred: ${error.message}`, {
    statusCode: error.statusCode,
    type: error.type || 'UnknownError',
    path: req.path,
    method: req.method,
    ip: req.ip,
    stack: error.stack
  });
  
  // Send error response
  res.status(error.statusCode).json({
    success: false,
    error: {
      message: error.message,
      type: error.type || 'Error',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    },
    timestamp: error.timestamp
  });
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const handleUncaughtExceptions = () => {
  process.on('uncaughtException', (error) => {
    Logger.error('Uncaught Exception:', error);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    Logger.error('Unhandled Rejection:', { reason, promise });
    process.exit(1);
  });
};

const withRetry = async (fn, options = {}) => {
  const {
    maxRetries = 3,
    delay = 1000,
    backoff = 2,
    shouldRetry = (error) => error.statusCode >= 500
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }
      
      const waitTime = delay * Math.pow(backoff, attempt);
      Logger.debug(`Retry attempt ${attempt + 1} after ${waitTime}ms`, {
        error: error.message
      });
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw lastError;
};

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ExternalAPIError,
  RateLimitError,
  errorHandler,
  asyncHandler,
  handleUncaughtExceptions,
  withRetry
};