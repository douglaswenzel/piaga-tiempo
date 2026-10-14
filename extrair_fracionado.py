from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from zoneinfo import ZoneInfo

import pandas as pd
import psycopg
from dotenv import load_dotenv

load_dotenv()
TIMEZONE = ZoneInfo("America/Sao_Paulo")
CHUNK_SIZE = 1000
AZURE_ROOT = "piaga-tiempo"

PRODUCT_COLUMNS = [
    'ID', 'Código', 'Descrição', 'Unidade', 'NCM', 'Origem', 'Preço',
    'Valor IPI fixo', 'Observações', 'Situação', 'Estoque', 'Preço de custo',
    'Cód no fornecedor', 'Fornecedor', 'Localização', 'Estoque maximo', 'Estoque minimo',
    'Peso líquido (Kg)', 'Peso bruto (Kg)', 'GTIN/EAN', 'GTIN/EAN da embalagem',
    'Largura do Produto', 'Altura do Produto', 'Profundidade do produto', 'Data Validade',
    'Descrição do Produto no Fornecedor', 'Descrição Complementar', 'Itens p/ caixa',
    'Produto Variação', 'Tipo Produção', 'Classe de enquadramento do IPI',
    'Código da lista de serviços', 'Tipo do item', 'Grupo de Tags/Tags', 'Tributos',
    'Código Pai', 'Código Integração', 'Grupo de produtos', 'Marca', 'CEST',
    'Volumes', 'Descrição Curta', 'Cross-Docking', 'URL Imagens Externas', 'Link Externo',
    'Meses Garantia no Fornecedor', 'Clonar dados do pai', 'Condição do produto', 'Frete Grátis',
    'Número FCI', 'Vídeo', 'Departamento', 'Unidade de medida', 'Preço de compra',
    'Valor base ICMS ST para retenção', 'Valor ICMS ST para retenção', 'Valor ICMS próprio do substituto',
    'Categoria do produto', 'Informações Adicionais',
]


def required(key: str) -> str:
    value = os.getenv(key, "").strip()
    if not value:
        raise RuntimeError(f"Variável obrigatória ausente: {key}")
    return value


def validate(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        raise RuntimeError("Nenhum produto retornado pelo Neon; relatório cancelado.")
    if df["sku"].isna().any() or df["sku"].astype(str).str.strip().eq("").any():
        raise RuntimeError("Produtos com SKU vazio ou nulo.")
    if df["sku"].duplicated().any():
        raise RuntimeError("Neon retornou SKUs duplicados.")
    if df["description"].isna().any() or df["description"].astype(str).str.strip().eq("").any():
        raise RuntimeError("Há produtos sem descrição.")

    for column in ("price", "stock"):
        df[column] = pd.to_numeric(df[column], errors="raise")
        if df[column].isna().any() or (~df[column].ge(0)).any():
            raise RuntimeError(f"Campo {column}: valores nulos, negativos ou inválidos.")
        if (~df[column].map(lambda v: bool(pd.notna(v)) and float(v) < float('inf'))).any():
            raise RuntimeError(f"Campo {column}: valores não finitos.")
    if (~df["stock"].map(lambda value: float(value).is_integer())).any():
        raise RuntimeError("Estoque contém quantidade fracionária.")
    df["stock"] = df["stock"].astype(int)
    return df


def build_stock(df: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({
        'ID Produto': '',
        'Código SKU*': df['sku'],
        'GTIN/EAN**': '',
        'Nome do Produto': df['description'],
        'Depósito*': 'Geral',
        'Movimentação de Estoque*': df['stock'],
        'Tipo de lançamento*': 'Balanço',
        'Preço de Compra*': df['price'],
        'Preço de Custo': df['price'],
        'Observação': '',
    })


def build_products(df: pd.DataFrame) -> pd.DataFrame:
    result = pd.DataFrame(index=df.index, columns=PRODUCT_COLUMNS)
    result['Código'] = df['sku']
    result['Descrição'] = df['description']
    result['Unidade'] = 'UN'
    # NCM não deve ser fixo para todos os produtos sem confirmação fiscal.
    # Informe BLING_NCM_DEFAULT somente se fiscalmente aprovado.
    result['NCM'] = os.getenv('BLING_NCM_DEFAULT', '')
    result['Origem'] = '0'
    result['Preço'] = df['price']  # preço do fornecedor, SEM markup
    result['Situação'] = 'Ativo'
    result['Estoque'] = df['stock']
    result['Preço de custo'] = df['price']
    result['Cód no fornecedor'] = df['sku']
    result['Grupo de produtos'] = df['group_name'].fillna('')
    result['Marca'] = df['manufacturer'].fillna('')
    return result


def write_parts(frame: pd.DataFrame, folder: Path, prefix: str) -> list[Path]:
    folder.mkdir(parents=True, exist_ok=True)
    files: list[Path] = []
    for start in range(0, len(frame), CHUNK_SIZE):
        index = start // CHUNK_SIZE + 1
        path = folder / f'{prefix}_{index}.xlsx'
        chunk = frame.iloc[start:start + CHUNK_SIZE]
        chunk.to_excel(path, index=False, sheet_name='Sheet1', engine='openpyxl')
        if not path.is_file() or path.stat().st_size == 0:
            raise RuntimeError(f"Planilha vazia ou ausente: {path}")
        files.append(path)
        print(f"Planilha gerada: {path} ({len(chunk)} linhas)", flush=True)
    return files


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as fp:
        for buffer in iter(lambda: fp.read(1024 * 1024), b''):
            digest.update(buffer)
    return digest.hexdigest()


def azure_publish(zip_path: Path, manifest: dict, prefix: str) -> None:
    """Armazena ZIP+manifesto num contêiner privado e notifica a fila.

    DefaultAzureCredential usa Azure CLI autenticado no GitHub Actions via OIDC
    ou az login em execução local. Não requer chave de Storage.
    """
    from azure.identity import DefaultAzureCredential
    from azure.storage.blob import BlobServiceClient, ContentSettings
    from azure.storage.queue import QueueClient, TextBase64EncodePolicy

    account = required('PIAGA_AZURE_STORAGE_ACCOUNT')
    container = os.getenv('PIAGA_AZURE_CONTAINER', 'relatorios')
    queue_name = os.getenv('PIAGA_AZURE_QUEUE', 'relatorios-prontos')
    zip_key = f'{prefix}/relatorio_completo.zip'
    manifest_key = f'{prefix}/manifesto.json'
    credential = DefaultAzureCredential(exclude_interactive_browser_credential=True)
    service = BlobServiceClient(
        account_url=f'https://{account}.blob.core.windows.net',
        credential=credential,
    )
    container_client = service.get_container_client(container)

    with zip_path.open('rb') as stream:
        container_client.upload_blob(
            name=zip_key,
            data=stream,
            overwrite=False,
            content_settings=ContentSettings(content_type='application/zip'),
            metadata={'sha256': manifest['zip_sha256']},
        )
    remote_size = container_client.get_blob_client(zip_key).get_blob_properties().size
    if remote_size != zip_path.stat().st_size:
        raise RuntimeError('Azure Blob: tamanho remoto do ZIP divergente.')

    manifest['blob_container'] = container
    manifest['blob_name'] = zip_key
    container_client.upload_blob(
        name=manifest_key,
        data=json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8'),
        overwrite=False,
        content_settings=ContentSettings(content_type='application/json'),
    )

    # Notificar por último, somente após as duas gravações bem-sucedidas.
    queue = QueueClient(
        account_url=f'https://{account}.queue.core.windows.net',
        queue_name=queue_name,
        credential=credential,
        message_encode_policy=TextBase64EncodePolicy(),
    )
    notification = {
        'execution_id': manifest['execution_id'],
        'container': container,
        'zip_blob': zip_key,
        'manifest_blob': manifest_key,
    }
    queue.send_message(json.dumps(notification, ensure_ascii=False))
    print(f'✅ Azure publicado e notificado: {container}/{zip_key}', flush=True)

def main() -> None:
    now = datetime.now(TIMEZONE)
    run = re.sub(r'[^A-Za-z0-9_-]', '', os.getenv('GITHUB_RUN_ID', f'local-{now:%Y%m%d%H%M%S}'))
    attempt = re.sub(r'[^A-Za-z0-9_-]', '', os.getenv('GITHUB_RUN_ATTEMPT', '1'))
    execution = f'{run}-{attempt}'
    prefix = f'{AZURE_ROOT}/{now:%Y/%m/%d/%H%M}/{execution}'
    out = Path('output') / f'{now:%Y/%m/%d/%H%M}' / execution
    stock_dir = out / 'estoque'
    products_dir = out / 'produto'
    out.mkdir(parents=True, exist_ok=False)

    with psycopg.connect(required('DATABASE_URL'), connect_timeout=30) as connection:
        with connection.cursor() as cursor:
            cursor.execute('''
                SELECT sku, description, manufacturer, group_name, price, stock
                FROM products ORDER BY sku
            ''')
            rows = cursor.fetchall()


    df = pd.DataFrame(
        rows,
        columns=[
            'sku', 'description', 'manufacturer',
            'group_name', 'price', 'stock'
        ]
    )

    sku = df['sku'].astype('string').str.strip()

    invalidos = (
        sku.isna()
        | sku.eq('')
        | sku.str.lower().isin(['nan', 'none', 'null'])
    ).fillna(True)

    print(f"Produtos extraídos: {len(df)}")
    print(f"Produtos sem SKU: {invalidos.sum()}")

    if invalidos.any():
        print("Registros com SKU inválido:")
        print(
            df.loc[invalidos, [
                'sku', 'description', 'manufacturer',
                'group_name'
            ]].head(20).to_string()
        )

    df = validate(df)

    print(f'Neon: {len(df)} produtos para exportação.', flush=True)

    stock_files = write_parts(build_stock(df), stock_dir, 'estoque_todos')
    product_files = write_parts(build_products(df), products_dir, 'produtos_todos')
    sheets = stock_files + product_files
    manifest: dict = {
        'project': 'PIAGA-TIEMPO',
        'execution_id': execution,
        'created_at': now.isoformat(),
        'products': len(df),
        'excel_files': len(sheets),
        'excel_paths': [p.relative_to(out).as_posix() for p in sheets],
        'status': 'complete',
    }
    (out / 'log_extracao.txt').write_text(
        f"PIAGA-TIEMPO\nData: {now.isoformat()}\nProdutos: {len(df)}\n"
        f"Planilhas: {len(sheets)}\nIdentificador: {execution}\n",
        encoding='utf-8',
    )
    (out / 'execucao.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    zip_path = out / 'relatorio_completo.zip'
    with ZipFile(zip_path, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
        for file in sorted(out.rglob('*')):
            if file.is_file() and file != zip_path:
                archive.write(file, arcname=file.relative_to(out).as_posix())
    with ZipFile(zip_path) as archive:
        if archive.testzip() is not None or len(archive.namelist()) != len(sheets) + 2:
            raise RuntimeError('Falha de integridade ao validar o arquivo ZIP.')

    manifest['zip_bytes'] = zip_path.stat().st_size
    manifest['zip_sha256'] = sha256(zip_path)
    print(f'✅ ZIP pronto: {zip_path} ({manifest["zip_bytes"]} bytes)', flush=True)

    if os.getenv('AZURE_PUBLISH_ENABLED', 'false').lower() == 'true':
        azure_publish(zip_path, manifest, prefix)
    else:
        print('ℹ️ AZURE_PUBLISH_ENABLED=false; ZIP gerado apenas localmente.', flush=True)


if __name__ == '__main__':
    main()
