FROM node:20-alpine

WORKDIR /app

# Abhängigkeiten zuerst (Docker Layer Caching)
COPY package.json ./
RUN npm install --omit=dev

# Quellcode
COPY index.js ./

# Port freigeben
EXPOSE 3000

# Health-Check (nutzt den /health Endpoint)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "index.js"]
