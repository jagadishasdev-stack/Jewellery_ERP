FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src
COPY .env.example .env

RUN mkdir -p uploads/logos uploads/stamps uploads/signatures uploads/scheme-groups

EXPOSE 5000
CMD ["node", "src/index.js"]
