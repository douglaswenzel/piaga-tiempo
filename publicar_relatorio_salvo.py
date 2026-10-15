from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime
from pathlib import Path
from zipfile import ZipFile


def required(name: str) -> str:
    result = os.environ.get(name, '').strip()
    if not result:
        raise RuntimeError(f'Variável obrigatória ausente: {name}')
    return result


def digest_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as source:
        for part in iter(lambda: source.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()


def prepare(zip_path: Path) -> tuple[dict, str]:
    """Verifica ZIP e recupera o manifesto original embutido no arquivo."""
    if not zip_path.is_file() or zip_path.stat().st_size == 0:
        raise RuntimeError('ZIP ausente ou vazio.')

    with ZipFile(zip_path) as archive:
        file_names = archive.namelist()
        if len(file_names) != len(set(file_names)):
            raise RuntimeError('ZIP com entradas duplicadas.')
        if archive.testzip() is not None:
            raise RuntimeError('ZIP danificado (CRC).')
        if 'execucao.json' not in file_names:
            raise RuntimeError('ZIP sem execucao.json original.')
        manifest = json.loads(archive.read('execucao.json').decode('utf-8'))
        excel_paths = manifest.get('excel_paths', [])
        if not isinstance(excel_paths, list) or not excel_paths:
            raise RuntimeError('Lista de planilhas ausente no manifesto.')
        if any(not isinstance(p, str) or not p.endswith('.xlsx') or
               p.startswith('/') or '..' in Path(p).parts for p in excel_paths):
            raise RuntimeError('Nome de planilha inválido no manifesto.')
        if len(excel_paths) != manifest.get('excel_files'):
            raise RuntimeError('Quantidade de planilhas divergente.')
        if not set(excel_paths).issubset(set(file_names)):
            raise RuntimeError('ZIP não contém todas as planilhas do manifesto.')

    execution = manifest.get('execution_id', '')
    if not isinstance(execution, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', execution):
        raise RuntimeError('Identificador de execução inválido.')
    if manifest.get('status') != 'complete' or not isinstance(manifest.get('products'), int) or manifest['products'] <= 0:
        raise RuntimeError('Manifesto não informa exportação concluída com produtos.')

    try:
        created = datetime.fromisoformat(manifest['created_at'])
    except (ValueError, KeyError, TypeError) as e:
        raise RuntimeError('Data de criação inválida no manifesto.') from e
    if created.tzinfo is None:
        raise RuntimeError('Data de criação do manifesto sem fuso horário.')

    manifest['zip_bytes'] = zip_path.stat().st_size
    manifest['zip_sha256'] = digest_of(zip_path)
    prefix = f'piaga-tiempo/{created:%Y/%m/%d/%H%M}/{execution}'
    return manifest, prefix


def upload_blob_if_needed(container, name: str, data, *, content_type: str,
                          expected_size: int, sha256: str | None = None) -> None:
    from azure.core.exceptions import ResourceNotFoundError
    from azure.storage.blob import ContentSettings

    blob = container.get_blob_client(name)
    try:
        props = blob.get_blob_properties()
    except ResourceNotFoundError:
        props = None

    if props is not None:
        if props.size != expected_size:
            raise RuntimeError(f'Blob já existe com tamanho divergente: {name}')
        if sha256 is not None and (props.metadata or {}).get('sha256') != sha256:
            raise RuntimeError(f'Blob já existe com hash divergente: {name}')
        if content_type == 'application/json':
            remote = blob.download_blob().readall()
            if remote != data:
                raise RuntimeError(f'Manifesto remoto divergente: {name}')
        print(f'Blob já existe e confere: {name}', flush=True)
        return

    kwargs = {'name': name, 'data': data, 'overwrite': False,
              'content_settings': ContentSettings(content_type=content_type)}
    if sha256 is not None:
        kwargs['metadata'] = {'sha256': sha256}
    container.upload_blob(**kwargs)
    props = blob.get_blob_properties()
    if props.size != expected_size or (sha256 is not None and (props.metadata or {}).get('sha256') != sha256):
        raise RuntimeError(f'Integridade do upload não confirmada: {name}')
    print(f'Blob armazenado: {name}', flush=True)


def main() -> None:
    from azure.identity import DefaultAzureCredential
    from azure.storage.blob import BlobServiceClient
    from azure.storage.queue import QueueClient, TextBase64EncodePolicy

    mode = required('PIAGA_ORIGEM')
    if mode not in ('artifact', 'neon'):
        raise RuntimeError(f'Origem não permitida: {mode}')
    candidates = list(Path('recuperado' if mode == 'artifact' else 'output').rglob('relatorio_completo.zip'))
    if len(candidates) != 1:
        raise RuntimeError(f'Esperado 1 ZIP em {mode}, encontrados {len(candidates)}.')
    zip_path = candidates[0]
    manifest, prefix = prepare(zip_path)

    account = required('PIAGA_AZURE_STORAGE_ACCOUNT')
    container_name = os.environ.get('PIAGA_AZURE_CONTAINER', 'relatorios')
    queue_name = os.environ.get('PIAGA_AZURE_QUEUE', 'relatorios-prontos')
    zip_name = prefix + '/relatorio_completo.zip'
    manifest_name = prefix + '/manifesto.json'

    credential = DefaultAzureCredential(exclude_interactive_browser_credential=True)
    blobs = BlobServiceClient(f'https://{account}.blob.core.windows.net', credential=credential)
    container = blobs.get_container_client(container_name)

    with zip_path.open('rb') as contents:
        upload_blob_if_needed(container, zip_name, contents,
                              content_type='application/zip',
                              expected_size=manifest['zip_bytes'], sha256=manifest['zip_sha256'])

    manifest['blob_container'] = container_name
    manifest['blob_name'] = zip_name
    payload = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')
    # O manifesto foi armazenado fora do ZIP originalmente, com informacoes do upload.
    upload_blob_if_needed(container, manifest_name, payload,
                          content_type='application/json', expected_size=len(payload))

    queue = QueueClient(account_url=f'https://{account}.queue.core.windows.net',
                        queue_name=queue_name, credential=credential,
                        message_encode_policy=TextBase64EncodePolicy())
    queue.send_message(json.dumps({
        'execution_id': manifest['execution_id'],
        'container': container_name,
        'zip_blob': zip_name,
        'manifest_blob': manifest_name,
    }, ensure_ascii=False))

    print(f'Azure publicado e notificado: {container_name}/{zip_name}', flush=True)
    print(f'Origem: {mode}; produtos: {manifest["products"]}; planilhas: {manifest["excel_files"]}', flush=True)
    print('Confirme o recebimento no Gmail e a abertura do ZIP.', flush=True)


if __name__ == '__main__':
    main()
