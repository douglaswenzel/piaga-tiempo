
#!/usr/bin/env bash
set -Eeuo pipefail

echo "=================================================="
echo "PIAGA MOTORS — PIPELINE AUTOMATIZADO"
echo "Início: $(date -Is)"
echo "=================================================="

: "${DATABASE_URL:?DATABASE_URL não configurada}"
: "${CATALOGO_URL:?CATALOGO_URL não configurada}"
: "${EMAIL:?EMAIL não configurado}"
: "${SENHA:?SENHA não configurada}"

# 1. Atualizar o catálogo no Neon
echo "[1/2] Iniciando extrator Playwright..."
npx tsx src/collect-playwright.ts

# 2. Fracionar, armazenar e enviar os arquivos
echo "[2/2] Iniciando fracionador e entrega..."
python scripts/export_products.py

echo "Pipeline concluído: $(date -Is)"