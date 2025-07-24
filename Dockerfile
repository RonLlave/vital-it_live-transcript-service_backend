# Production Dockerfile optimized for stability and Coolify
FROM node:18-alpine AS base

# Install dependencies needed for audio processing, health checks, and debugging
RUN apk add --no-cache \
    ffmpeg \
    curl \
    tini \
    htop \
    procps

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies with better error handling
FROM base AS deps
RUN npm ci --only=production --loglevel=error && \
    npm cache clean --force

# Build stage (if needed for TypeScript or build steps)
FROM base AS build
COPY package*.json ./
RUN npm ci --loglevel=error
COPY . .
# Add any build commands here if needed
# RUN npm run build

# Production stage
FROM base AS runtime

# CRITICAL: Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Create non-root user with proper permissions
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p logs temp data && \
    chown -R nodejs:nodejs logs temp data && \
    chmod -R 755 logs temp data

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3003

# Health check with better tolerance
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
    CMD curl -f http://localhost:3003/health || exit 1

# Start command - run node directly
CMD ["node", "src/index.js"]