
import os
import html
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import boto3
import pandas as pd
import psycopg
import requests
from botocore.config import Config


TZ = ZoneInfo("America/Sao_Paulo")
NOW = datetime.now(TZ)
RUN_ID = NOW.strftime("%Y-%m-%d/%H-%M-%S")

OUT_DIR = Path("output") / NOW.strftime("%Y-%m-%d") / NOW.strftime("%H-%M-%S")
PRODUCT_DIR = OUT_DIR / "produto"
STOCK_DIR = OUT_DIR / "estoque"
LOG_FILE = OUT_DIR / "log_extracao_todos.txt"

CHUNK_SIZE = 1000
URL_EXPIRATION_SECONDS = 24 * 60 * 60


def required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Variável obrigatória ausente: {name}")
    return value


def log(message: str, file):
    print(message, flush=True)
    file.write(message + "\n")
    file.flush()


def main():
    database_url = required("DATABASE_URL")
    bucket = required("R2_BUCKET")
    account_id = required("R2_ACCOUNT_ID")
    access_key = required("R2_ACCESS_KEY_ID")
    secret_key = required("R2_SECRET_ACCESS_KEY")
    resend_key = required("RESEND_API_KEY")
    email_from = required("EMAIL_FROM")
    email_to = required("EMAIL_TO")

    PRODUCT_DIR.mkdir(parents=True, exist_ok=True)
    STOCK_DIR.mkdir(parents=True, exist_ok=True)

    files_to_upload = []

    with LOG_FILE.open("w", encoding="utf-8") as log_file:
        log(
            f"===== EXTRAÇÃO PIAGA MOTORS — {NOW.isoformat()} =====",
            log_file,
        )
        log(f"ID da execução: {RUN_ID}", log_file)

        # 1. Consultar os dados já atualizados no Neon.
        log("[1/5] Consultando produtos no Neon...", log_file)

        with psycopg.connect(database_url, connect_timeout=20) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT sku, description, manufacturer,
                           group_name, price, stock
                    FROM products
                    ORDER BY sku
                """)
                rows = cursor.fetchall()

        columns = [
            "sku", "description", "manufacturer",
            "group_name", "price", "stock",
        ]
        df = pd.DataFrame(rows, columns=columns)

        log(f"Total de produtos consultados: {len(df)}", log_file)

        if df.empty:
            raise RuntimeError(
                "A consulta retornou zero produtos. "
                "Exportação cancelada para evitar enviar arquivos vazios."
            )

        # Normalizar valores numéricos antes da exportação.
        df["stock"] = pd.to_numeric(
            df["stock"], errors="raise"
        ).fillna(0)

        df["price"] = pd.to_numeric(
            df["price"], errors="raise"
        )

        # 2. Gerar arquivos de movimentação de estoque.
        log("[2/5] Gerando planilhas de estoque...", log_file)

        df_estoque = pd.DataFrame({
            "ID Produto": "",
            "Código SKU*": df["sku"],
            "GTIN/EAN**": "",
            "Nome do Produto": df["description"],
            "Depósito*": "Geral",
            "Movimentação de Estoque*": df["stock"].astype(int),
            "Tipo de lançamento*": "Balanço",
            "Preço de Compra*": df["price"],
            "Preço de Custo": df["price"],
            "Observação": "",
        })

        for start in range(0, len(df_estoque), CHUNK_SIZE):
            part = start // CHUNK_SIZE + 1
            path = STOCK_DIR / f"estoque_todos_{part}.xlsx"

            df_estoque.iloc[start:start + CHUNK_SIZE].to_excel(
                path, index=False, sheet_name="Sheet1"
            )
            files_to_upload.append(path)
            log(
                f"Estoque gerado: {path} "
                f"({min(CHUNK_SIZE, len(df_estoque) - start)} linhas)",
                log_file,
            )

        # 3. Gerar arquivos de cadastro de produtos.
        log("[3/5] Gerando planilhas de produtos...", log_file)

        product_columns = [
            "ID", "Código", "Descrição", "Unidade", "NCM",
            "Origem", "Preço", "Valor IPI fixo", "Observações",
            "Situação", "Estoque", "Preço de custo",
            "Cód no fornecedor", "Fornecedor", "Localização",
            "Estoque maximo", "Estoque minimo", "Peso líquido (Kg)",
            "Peso bruto (Kg)", "GTIN/EAN", "GTIN/EAN da embalagem",
            "Largura do Produto", "Altura do Produto",
            "Profundidade do produto", "Data Validade",
            "Descrição do Produto no Fornecedor",
            "Descrição Complementar", "Itens p/ caixa",
            "Produto Variação", "Tipo Produção",
            "Classe de enquadramento do IPI",
            "Código da lista de serviços", "Tipo do item",
            "Grupo de Tags/Tags", "Tributos", "Código Pai",
            "Código Integração", "Grupo de produtos", "Marca",
            "CEST", "Volumes", "Descrição Curta", "Cross-Docking",
            "URL Imagens Externas", "Link Externo",
            "Meses Garantia no Fornecedor", "Clonar dados do pai",
            "Condição do produto", "Frete Grátis", "Número FCI",
            "Vídeo", "Departamento", "Unidade de medida",
            "Preço de compra", "Valor base ICMS ST para retenção",
            "Valor ICMS ST para retenção",
            "Valor ICMS próprio do substituto",
            "Categoria do produto", "Informações Adicionais",
        ]

        df_produtos = pd.DataFrame(
            index=df.index, columns=product_columns
        )

        df_produtos["Código"] = df["sku"]
        df_produtos["Descrição"] = df["description"]
        df_produtos["Unidade"] = "UN"
        df_produtos["NCM"] = "8714.10.00"
        df_produtos["Origem"] = "0"
        df_produtos["Preço"] = df["price"]
        df_produtos["Situação"] = "Ativo"
        df_produtos["Estoque"] = df["stock"]
        df_produtos["Preço de custo"] = df["price"]
        df_produtos["Cód no fornecedor"] = df["sku"]
        df_produtos["Grupo de produtos"] = df["group_name"]
        df_produtos["Marca"] = df["manufacturer"]

        for start in range(0, len(df_produtos), CHUNK_SIZE):
            part = start // CHUNK_SIZE + 1
            path = PRODUCT_DIR / f"produtos_todos_{part}.xlsx"

            df_produtos.iloc[start:start + CHUNK_SIZE].to_excel(
                path, index=False, sheet_name="Sheet1"
            )
            files_to_upload.append(path)
            log(
                f"Produtos gerados: {path} "
                f"({min(CHUNK_SIZE, len(df_produtos) - start)} linhas)",
                log_file,
            )

        # 4. Enviar os arquivos para o R2 privado.
        log("[4/5] Enviando arquivos ao armazenamento privado...", log_file)

        s3 = boto3.client(
            "s3",
            endpoint_url=(
                f"https://{account_id}.r2.cloudflarestorage.com"
            ),
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )

        links = []

        for path in files_to_upload:
            key = f"piaga/{RUN_ID}/{path.name}"

            s3.upload_file(
                str(path),
                bucket,
                key,
                ExtraArgs={
                    "ContentType": (
                        "application/vnd.openxmlformats-officedocument."
                        "spreadsheetml.sheet"
                    )
                },
            )

            url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=URL_EXPIRATION_SECONDS,
            )

            links.append((path.name, url))
            log(f"Upload concluído: {path.name}", log_file)

        # 5. Enviar e-mail com links temporários.
        log("[5/5] Enviando e-mail...", log_file)

        rows_html = "".join(
            "<tr>"
            f"<td>{html.escape(name)}</td>"
            f'<td><a href="{html.escape(url, quote=True)}">'
            "Baixar arquivo</a></td>"
            "</tr>"
            for name, url in links
        )

        expiration = URL_EXPIRATION_SECONDS // 3600

        message_html = f"""
        <h2>PIAGA Motors — Catálogo atualizado</h2>
        <p>Data: {NOW.strftime("%d/%m/%Y %H:%M:%S")}</p>
        <p>Produtos consultados: {len(df)}</p>
        <p>Arquivos gerados: {len(links)}</p>
        <p>Os links expiram em {expiration} horas.</p>
        <table border="1" cellpadding="6" cellspacing="0">
          <thead><tr><th>Arquivo</th><th>Download</th></tr></thead>
          <tbody>{rows_html}</tbody>
        </table>
        """

        response = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {resend_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": email_from,
                "to": [email_to],
                "subject": (
                    "PIAGA Motors — Arquivos de catálogo — "
                    + NOW.strftime("%d/%m/%Y %H:%M")
                ),
                "html": message_html,
            },
            timeout=30,
        )

        if not response.ok:
            raise RuntimeError(
                f"Falha no Resend: HTTP {response.status_code} — "
                f"{response.text[:1000]}"
            )

        log("E-mail enviado com sucesso.", log_file)
        log(f"Produtos exportados: {len(df)}", log_file)
        log(f"Arquivos armazenados: {len(links)}", log_file)
        log("PROCESSO CONCLUÍDO.", log_file)


if __name__ == "__main__":
    main()