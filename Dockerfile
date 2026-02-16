FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --production
COPY server/src ./src
COPY server/.env.example ./.env.example
EXPOSE 3000
ENV PORT=3000
CMD ["node", "src/index.js"]
