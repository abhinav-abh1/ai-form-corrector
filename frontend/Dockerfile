# Stage 1: install deps and build
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --no-fund --no-audit
COPY . .
RUN npm run build

# Stage 2: runtime image
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user first
RUN useradd --create-home --shell /bin/bash appuser

# Copy build output
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public

# Give ownership of the app directory to appuser
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 3000
CMD ["npm", "start"]