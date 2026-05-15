FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production && npm run db:generate
COPY dist ./dist/

FROM base AS api
CMD ["node", "dist/api/index.js"]

FROM base AS worker
CMD ["node", "dist/worker/index.js"]

FROM base AS scheduler
CMD ["node", "dist/scheduler/index.js"]
