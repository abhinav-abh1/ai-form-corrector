# Stage 1: install deps and build. This stage's ~350MB of node_modules never reaches
# the final image — only the compiled output does.
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --no-fund --no-audit
COPY . .
RUN npm run build

# Stage 2: the actual runtime image — small, no build tools, no source, no dev deps.
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public

RUN useradd --create-home appuser
USER appuser

EXPOSE 3000
CMD ["npm", "start"]
