FROM mcr.microsoft.com/playwright:v1.62.0-jammy

WORKDIR /app

ENV NODE_ENV=production \
    HEADLESS=true \
    TZ=America/Sao_Paulo

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .

RUN chown -R pwuser:pwuser /app
USER pwuser

CMD ["npx", "tsx", "src/collect-playwright.ts"]