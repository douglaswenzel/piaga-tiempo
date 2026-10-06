FROM mcr.microsoft.com/playwright:v1.62.0-jammy

WORKDIR /app

ENV NODE_ENV=production \
    HEADLESS=true \
    TZ=America/Sao_Paulo

# Copia manifestos primeiro (cache de layer)
COPY package*.json ./

# Instala TODAS as deps (inclui tsx e @types/*, que são devDeps)
# --no-audit/--no-fund só para limpar o log
RUN npm install --no-audit --no-fund

# Copia o resto do código
COPY . .

# Cria pasta do SQLite e ajusta permissão para o usuário não-root
RUN mkdir -p /app/data && chown -R pwuser:pwuser /app
USER pwuser

# Entrypoint = mesmo script do "npm run collect:all"
CMD ["npx", "tsx", "src/collect-playwright.ts"]