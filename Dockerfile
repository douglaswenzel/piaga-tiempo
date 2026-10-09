
FROM mcr.microsoft.com/playwright:v1.62.0-jammy

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}" \
    NODE_ENV=production \
    HEADLESS=true \
    TZ=America/Sao_Paulo \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/output \
    && chown -R pwuser:pwuser /app /opt/venv

USER pwuser

CMD ["bash", "scripts/run-pipeline.sh"]