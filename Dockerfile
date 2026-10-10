FROM node:22-slim

# The app shells out to the Claude Code CLI for AI; credentials are mounted at runtime (see docker-compose.yml).
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build && chown -R node:node /app

USER node
ENV PORT=8787 NODE_ENV=production
EXPOSE 8787
WORKDIR /app/server
CMD ["node", "--import", "tsx", "src/index.ts"]
