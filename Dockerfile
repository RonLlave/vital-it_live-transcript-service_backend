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

# Create necessary directories
RUN mkdir -p logs temp && chown -R nodejs:nodejs logs temp

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1

# Start command
CMD ["node", "src/index.js"]