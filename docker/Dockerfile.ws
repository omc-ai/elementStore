FROM node:20-alpine
WORKDIR /app
COPY ws/package.json ws/package-lock.json* ./
RUN npm ci --production
COPY ws/ .
CMD ["node", "server.js"]
