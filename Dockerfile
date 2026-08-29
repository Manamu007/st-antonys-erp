# ==========================================
# Stage 1: Build Frontend & Backend
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install all dependencies (including devDependencies for build tools)
RUN npm ci

# Copy source code and configuration files
COPY . .

# Build Vite frontend and compile backend bundle into dist/server.cjs
RUN npm run build

# ==========================================
# Stage 2: Production Runner (Scale-to-Zero Cloud Run)
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application outputs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json
COPY --from=builder /app/index.html ./index.html

# Create directories for runtime uploads and assign permissions to standard 'node' user
RUN mkdir -p /app/uploads /app/comm && \
    chown -R node:node /app

# Switch to non-root execution for secure container runtime
USER node

# Container Port
EXPOSE 3000

# Start compiled CommonJS server bundle
CMD ["node", "dist/server.cjs"]
