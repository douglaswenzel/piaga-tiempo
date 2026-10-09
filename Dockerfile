FROM mcr.microsoft.com/playwright:v1.62.0-jammy

USER root

ENV NODE_ENV=production \
    HEADLESS=true \
    TZ=America/Sao_Paulo

WORKDIR /app

COPY package*.json ./

RUN npm ci --no-audit --no-fund

COPY . .

RUN mkdir -p /app/output \
    && chown -R pwuser:pwuser /app

USER pwuser

CMD ["npx", "tsx", "src/collect-playwright.ts"]