FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
ENV PORT=3000 DB_PATH=/data/pusula.db NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
