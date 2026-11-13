FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends clamdscan ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.25.0
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY server ./server
COPY public ./public
COPY deploy/clamd.conf /etc/clamav/clamd.conf
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=4310 DATA_DIR=/app/data NODE_ENV=production SCANNER_COMMAND=/usr/bin/clamdscan
EXPOSE 4310
CMD ["node", "server/index.js"]
