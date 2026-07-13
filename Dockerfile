FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --production
COPY server/src ./src
COPY server/.env.example ./.env.example
# El logo se embebe en base64 dentro de los PDFs (services/pdf/template.js) — la imagen
# de Docker solo trae server/src, así que se copia aparte desde client/public.
COPY client/public/condor-logo.png ./assets/condor-logo.png
EXPOSE 3000
ENV PORT=3000
CMD ["node", "src/index.js"]
