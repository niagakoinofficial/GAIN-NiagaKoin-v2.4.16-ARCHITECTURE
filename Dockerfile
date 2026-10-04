FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts
RUN npm install -g tsx
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
COPY --from=build /app/firebase.json ./firebase.json
COPY --from=build /app/firestore.rules ./firestore.rules
COPY --from=build /app/firestore.indexes.json ./firestore.indexes.json
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/privkey ./privkey
EXPOSE 3000
CMD ["node", "--import", "tsx", "server.ts"]
