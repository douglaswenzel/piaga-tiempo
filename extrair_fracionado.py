import os
from datetime import datetime

import pandas as pd
import psycopg
from dotenv import load_dotenv

# ===============================
# CARREGA VARIÁVEIS DE AMBIENTE
# ===============================
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL não encontrada. Verifique se o .env está na raiz do projeto."
    )

OUT_DIR = 'output'  # pasta raiz de saída

# ===============================
# FUNÇÃO PARA NOME DA PASTA DO DIA
# ===============================
def nome_pasta_dia():
    """Retorna a data no formato '13-set' (dia + abreviação do mês em português)"""
    meses = {
        1: 'jan', 2: 'fev', 3: 'mar', 4: 'abr', 5: 'mai', 6: 'jun',
        7: 'jul', 8: 'ago', 9: 'set', 10: 'out', 11: 'nov', 12: 'dez'
    }
    hoje = datetime.now()
    return f"{hoje.day}-{meses[hoje.month]}"

# ===============================
# CRIA ESTRUTURA DE PASTAS
# ===============================
pasta_dia = os.path.join(OUT_DIR, nome_pasta_dia())
pasta_produto = os.path.join(pasta_dia, 'produto')
pasta_estoque = os.path.join(pasta_dia, 'estoque')
os.makedirs(pasta_produto, exist_ok=True)
os.makedirs(pasta_estoque, exist_ok=True)

LOG_FILE = os.path.join(pasta_dia, 'log_extracao_todos.txt')
log_f = open(LOG_FILE, 'w', encoding='utf-8')
log_f.write(f"===== LOG DE EXTRAÇÃO - {datetime.now().strftime('%d/%m/%Y %H:%M:%S')} =====\n\n")

# ===============================
# 1. Conectar ao Neon e buscar TODOS os produtos
# ===============================
with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT sku, description, manufacturer, group_name, price, stock FROM products"
        )
        all_products = cursor.fetchall()

print(f"Total de produtos no banco: {len(all_products)}")
log_f.write(f"Total de produtos no banco: {len(all_products)}\n\n")

# ===============================
# 2. DataFrame base
# ===============================
df_encontrados = pd.DataFrame(
    all_products,
    columns=['sku', 'description', 'manufacturer', 'group_name', 'price', 'stock']
)

# ===============================
# 3. Movimentação de Estoque (fracionado)
# ===============================
df_estoque = pd.DataFrame()
df_estoque['ID Produto'] = ''
df_estoque['Código SKU*'] = df_encontrados['sku']
df_estoque['GTIN/EAN**'] = ''
df_estoque['Nome do Produto'] = df_encontrados['description']
df_estoque['Depósito*'] = 'Geral'
df_estoque['Movimentação de Estoque*'] = df_encontrados['stock'].astype(int)
df_estoque['Tipo de lançamento*'] = 'Balanço'
df_estoque['Preço de Compra*'] = df_encontrados['price']
df_estoque['Preço de Custo'] = df_encontrados['price']
df_estoque['Observação'] = ''

chunk_size = 1000
total_estoque = len(df_estoque)
for i in range(0, total_estoque, chunk_size):
    chunk = df_estoque.iloc[i:i+chunk_size]
    parte = i // chunk_size + 1
    nome_arquivo = f'estoque_todos_{parte}.xlsx'
    caminho = os.path.join(pasta_estoque, nome_arquivo)
    chunk.to_excel(caminho, index=False, sheet_name='Sheet1')
    msg = f"Arquivo de estoque gerado: {caminho} ({len(chunk)} linhas)"
    print(msg)
    log_f.write(msg + "\n")

# ===============================
# 4. Cadastro de Produto (fracionado)
# ===============================
colunas_produtos = [
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
    'Categoria do produto', 'Informações Adicionais'
]

df_produtos = pd.DataFrame(columns=colunas_produtos)
df_produtos['Código'] = df_encontrados['sku']
df_produtos['Descrição'] = df_encontrados['description']
df_produtos['Unidade'] = 'UN'
df_produtos['NCM'] = '8714.10.00'
df_produtos['Origem'] = '0'
df_produtos['Preço'] = df_encontrados['price']
df_produtos['Situação'] = 'Ativo'
df_produtos['Estoque'] = df_encontrados['stock']
df_produtos['Preço de custo'] = df_encontrados['price']
df_produtos['Cód no fornecedor'] = df_encontrados['sku']
df_produtos['Grupo de produtos'] = df_encontrados['group_name']
df_produtos['Marca'] = df_encontrados['manufacturer']

total_produtos = len(df_produtos)
for i in range(0, total_produtos, chunk_size):
    chunk = df_produtos.iloc[i:i+chunk_size]
    parte = i // chunk_size + 1
    nome_arquivo = f'produtos_todos_{parte}.xlsx'
    caminho = os.path.join(pasta_produto, nome_arquivo)
    chunk.to_excel(caminho, index=False, sheet_name='Sheet1')
    msg = f"Arquivo de produto gerado: {caminho} ({len(chunk)} linhas)"
    print(msg)
    log_f.write(msg + "\n")

# ===============================
# 5. Finalizar
# ===============================
log_f.write(f"\n✅ Processo concluído com {len(df_encontrados)} produtos.\n")
log_f.close()

print("\n✅ Processo concluído!")