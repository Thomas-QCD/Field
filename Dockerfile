# Field API — Node server only (static web is S3 + CloudFront).
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
# pg is required at runtime by the API (also listed under dependencies).
RUN npm ci --omit=dev

COPY server ./server

ENV NODE_ENV=production
ENV API_PORT=3000
EXPOSE 3000

USER node
CMD ["node", "server/index.mjs"]
