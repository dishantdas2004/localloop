FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3000 DB_FILE=/data/localloop.db
RUN mkdir -p /data
EXPOSE 3000
CMD ["npm", "start"]
