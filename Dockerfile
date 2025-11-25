# Multi-stage Dockerfile for Veilfire Chat (Next.js 14)

# Install dependencies
FROM node:20-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Build the Next.js app
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=production
# Provide minimal Mongo env so Next.js server code that validates
# MONGODB_URI can be compiled during `next build` without failing.
ENV MONGODB_URI=mongodb://localhost:27017/veilfire_chat
ENV MONGO_AUTH=FALSE

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Production runtime image
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy only what we need to run the app
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "run", "start"]
