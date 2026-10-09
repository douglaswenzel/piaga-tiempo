
#!/usr/bin/env bash
set -Eeuo pipefail

echo "========================================"
echo "PIAGA Motors - Iniciando extração"
echo "========================================"

: "${DATABASE_URL:?Secret DATABASE_URL não configurada}"
: "${CATALOGO_URL:?Secret CATALOGO_URL não configurada}"
: "${CATALOGO_EMAIL:?Secret CATALOGO_EMAIL não configurada}"
: "${CATALOGO_SENHA:?Secret CATALOGO_SENHA não configurada}"

npx tsx src/collect-playwright.ts

echo "========================================"
echo "Extração concluída com sucesso"
echo "========================================"