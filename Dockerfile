FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /data && chown -R node:node /data /app

USER node

EXPOSE 8546 6001

CMD ["node", "cli.js", "node", "--rpc-host", "0.0.0.0", "--data-dir", "/data"]
