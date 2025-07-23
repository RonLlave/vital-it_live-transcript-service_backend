# Live Transcript Service - Docker Compose Setup for Coolify Deployment

## Overview

This document provides the Docker Compose configuration and deployment setup for the Live Transcript Service backend project. The service will be deployed on Coolify using Docker Compose with custom build and start commands.

## Project Structure Required

```
live-transcript-service/
├── src/
│   └── index.js              # Main entry point
├── package.json              # Node.js dependencies
├── package-lock.json         # Locked dependencies
├── .env.example              # Example environment variables
├── .dockerignore             # Docker ignore file
├── Dockerfile                # Production Docker image
├── docker-compose.yml        # Main deployment file for Coolify
├── docker-compose.dev.yml    # Local development compose file
└── README.md                 # Project documentation
```

## 1. Dockerfile (Production)

```dockerfile
# Production Dockerfile optimized for Coolify
FROM node:18-alpine AS base

# Install dependencies needed for audio processing and health checks
RUN apk add --no-cache \
    ffmpeg \
    curl \
    tini

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
FROM base AS deps
RUN npm ci --only=production

# Build stage (if needed for TypeScript or build steps)
FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
# Add any build commands here if needed
# RUN npm run build

# Production stage
FROM base AS runtime

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1

# Start command
CMD ["node", "src/index.js"]
```

## 2. docker-compose.yml (Coolify Deployment)

```yaml
version: "3.8"

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
      args:
        - NODE_ENV=production
    container_name: live-transcript-service
    restart: unless-stopped
    ports:
      - "${PORT:-3003}:3003"
    environment:
      # Server Configuration
      - NODE_ENV=production
      - PORT=3003
      - SERVICE_NAME=live-transcript-service

      # Meeting Bot API Configuration
      - MEETING_BOT_API_URL=${MEETING_BOT_API_URL}
      - MEETING_BOT_API_KEY=${MEETING_BOT_API_KEY}

      # Google Gemini API Configuration
      - GOOGLE_GEMINI_API_KEY=${GOOGLE_GEMINI_API_KEY}
      - GOOGLE_GEMINI_MODEL=${GOOGLE_GEMINI_MODEL:-gemini-1.5-flash}
      - GEMINI_AUDIO_SAMPLE_RATE=${GEMINI_AUDIO_SAMPLE_RATE:-16000}

      # Audio Processing Configuration
      - AUDIO_FETCH_INTERVAL=${AUDIO_FETCH_INTERVAL:-5000}
      - AUDIO_BUFFER_SIZE=${AUDIO_BUFFER_SIZE:-30}
      - AUDIO_FORMAT=${AUDIO_FORMAT:-WAV}

      # Transcript Configuration
      - TRANSCRIPT_LANGUAGE=${TRANSCRIPT_LANGUAGE:-auto}
      - ENABLE_SPEAKER_DIARIZATION=${ENABLE_SPEAKER_DIARIZATION:-true}
      - MAX_TRANSCRIPT_LENGTH=${MAX_TRANSCRIPT_LENGTH:-500000}
      - TRANSCRIPT_LANGUAGE_HINTS=${TRANSCRIPT_LANGUAGE_HINTS:-en,de,es,fr,it,pt,nl,pl}

      # Service Configuration
      - ENABLE_HEALTH_CHECKS=${ENABLE_HEALTH_CHECKS:-true}
      - LOG_LEVEL=${LOG_LEVEL:-info}
      - ENABLE_METRICS=${ENABLE_METRICS:-true}

    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

    # Resource limits (matching Meeting Bot API project)
    deploy:
      resources:
        limits:
          cpus: "4"
          memory: 20G
        reservations:
          cpus: "2"
          memory: 8G

    # Logging configuration
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

    # Volume for temporary audio files
    volumes:
      - audio_temp:/app/temp

    # Network configuration
    networks:
      - transcript_network

# Volumes
volumes:
  audio_temp:
    driver: local

# Networks
networks:
  transcript_network:
    driver: bridge
```

## 3. docker-compose.dev.yml (Local Development)

```yaml
version: "3.8"

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: base
    container_name: live-transcript-service-dev
    command: npm run dev
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=development
    env_file:
      - .env
    volumes:
      - .:/app
      - /app/node_modules
    restart: unless-stopped
    networks:
      - transcript_network

networks:
  transcript_network:
    driver: bridge
```

## 4. .dockerignore

```
node_modules
npm-debug.log
.env
.env.local
.env.*.local
.git
.gitignore
.dockerignore
docker-compose*.yml
Dockerfile*
.vscode
.idea
*.md
.DS_Store
coverage
.nyc_output
temp/
logs/
*.log
```

## 5. package.json (Essential Scripts)

```json
{
  "name": "live-transcript-service",
  "version": "1.0.0",
  "description": "Real-time transcription service for meeting recordings",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "jest",
    "lint": "eslint src/",
    "docker:build": "docker-compose build",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "docker:logs": "docker-compose logs -f",
    "docker:dev": "docker-compose -f docker-compose.dev.yml up"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "express": "^4.18.2",
    "@google/generative-ai": "^0.21.0",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "compression": "^1.7.4",
    "express-rate-limit": "^7.1.0",
    "winston": "^3.11.0",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.7.0",
    "eslint": "^8.54.0"
  }
}
```

## 6. Coolify Deployment Configuration

### Build Command (for Coolify)

```bash
docker build --target runtime -t live-transcript-service:latest .
```

### Start Command (for Coolify)

```bash
docker-compose up -d
```

### Environment Variables in Coolify

Set these in Coolify's environment variables section:

```
# Required
MEETING_BOT_API_URL=https://meeting-bot-backend.dev.singularity-works.com
GOOGLE_GEMINI_API_KEY=your-gemini-api-key

# Optional (with defaults)
PORT=3003
GOOGLE_GEMINI_MODEL=gemini-1.5-flash
AUDIO_FETCH_INTERVAL=5000
AUDIO_BUFFER_SIZE=30
TRANSCRIPT_LANGUAGE=auto
ENABLE_SPEAKER_DIARIZATION=true
MAX_TRANSCRIPT_LENGTH=500000
```

### Coolify Service Configuration

```yaml
# In Coolify UI, set these configurations:
Service Type: Docker Compose
Build Pack: Docker Compose
Base Directory: /
Docker Compose File: docker-compose.yml
```

## 7. Health Check Endpoint Implementation

```javascript
// src/routes/health.js
const express = require("express");
const router = express.Router();

router.get("/health", async (req, res) => {
  try {
    // Check Meeting Bot API connection
    const botApiHealthy = await checkBotAPIConnection();

    // Check Gemini API
    const geminiHealthy = await checkGeminiAPI();

    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const memoryHealthy = memoryUsage.heapUsed < 15 * 1024 * 1024 * 1024; // 15GB limit (75% of 20GB)

    const isHealthy = botApiHealthy && geminiHealthy && memoryHealthy;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      checks: {
        botAPI: botApiHealthy,
        geminiAPI: geminiHealthy,
        memory: memoryHealthy,
        memoryUsage: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      },
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      error: error.message,
    });
  }
});

module.exports = router;
```

## 8. Entry Point (src/index.js)

```javascript
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Routes
app.use("/health", require("./routes/health"));
app.use("/api/transcripts", require("./routes/transcripts"));
app.use("/api/status", require("./routes/status"));

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Live Transcript Service running on port ${PORT}`);
});
```

## 9. Deployment Steps for Coolify

1. **Prepare Repository**

   ```bash
   # Initialize git repository
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Configure in Coolify**

   - Add new resource → Docker Compose
   - Connect your Git repository
   - Set branch to `main`
   - Set Docker Compose file to `docker-compose.yml`
   - Configure environment variables
   - Set custom build command (optional)
   - Set custom start command (optional)

3. **Custom Commands in Coolify**

   - **Build Command**: Leave empty (uses docker-compose.yml)
   - **Start Command**: Leave empty (uses docker-compose.yml)
   - **Pre-deployment Command**: `echo "Starting deployment..."`
   - **Post-deployment Command**: `curl -f http://localhost:3003/health || exit 1`

4. **Domain Configuration**

   - Add your domain in Coolify
   - Enable HTTPS
   - Configure SSL certificates

5. **Monitoring**
   - Enable health checks in Coolify
   - Set up alerts for failures
   - Monitor resource usage

## 10. Troubleshooting

### Common Issues

1. **Port conflicts**

   - Ensure port 3003 is not used by other services
   - Can be changed via PORT environment variable

2. **Memory issues**

   - Default allocation is 20GB max (8GB minimum)
   - Monitor with `docker stats`
   - For very large meetings, may need to increase beyond 20GB

3. **API connection failures**

   - Verify MEETING_BOT_API_URL is accessible
   - Check network configuration

4. **Build failures**
   - Check Docker daemon is running
   - Verify Dockerfile syntax
   - Check for missing dependencies

### Debug Commands

```bash
# View logs
docker-compose logs -f app

# Check container status
docker-compose ps

# Enter container
docker-compose exec app sh

# Check resource usage
docker stats live-transcript-service

# Test health endpoint
curl http://localhost:3003/health
```

## Summary

This configuration provides:

- Production-ready Docker setup with multi-stage builds
- Proper health checks for Coolify monitoring
- Resource limits to prevent memory issues
- Graceful shutdown handling
- Security best practices (non-root user, minimal base image)
- Easy local development with docker-compose.dev.yml
- Comprehensive environment variable configuration

The service is ready to be deployed on Coolify with automatic builds and deployments from your Git repository.
