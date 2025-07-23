const winston = require('winston');
const path = require('path');

const { LOG_LEVEL = 'info', NODE_ENV = 'development' } = process.env;

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    
    return msg;
  })
);

const transports = [
  new winston.transports.Console({
    format: NODE_ENV === 'development' 
      ? winston.format.combine(winston.format.colorize(), logFormat)
      : logFormat
  })
];

if (NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );
}

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: logFormat,
  transports
});

const Logger = {
  info: (message, meta = {}) => logger.info(message, meta),
  error: (message, error = {}) => {
    if (error instanceof Error) {
      logger.error(message, { error: error.message, stack: error.stack, ...error });
    } else {
      logger.error(message, error);
    }
  },
  debug: (message, data = {}) => logger.debug(message, data),
  warn: (message, meta = {}) => logger.warn(message, meta),
  metric: (name, value, tags = {}) => {
    logger.info(`[METRIC] ${name}: ${value}`, { metric: name, value, tags });
  },
  
  // Helper methods for specific logging scenarios
  apiRequest: (method, url, statusCode, duration) => {
    logger.info(`API Request: ${method} ${url}`, {
      method,
      url,
      statusCode,
      duration: `${duration}ms`
    });
  },
  
  transcriptionMetric: (botId, duration, wordCount, confidence) => {
    logger.info('Transcription completed', {
      botId,
      duration: `${duration}ms`,
      wordCount,
      confidence
    });
  },
  
  startupInfo: (port, environment) => {
    logger.info(`Live Transcript Service started`, {
      port,
      environment,
      nodeVersion: process.version,
      pid: process.pid
    });
  }
};

module.exports = Logger;