from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone

import azure.functions as func
from azure.communication.email import EmailClient
from azure.core.exceptions import ResourceExistsError
from azure.identity import DefaultAzureCredential
from azure.storage.blob import (
    BlobServiceClient,
    BlobSasPermissions,
    generate_blob_sas,
)

app = func.FunctionApp()


def required(name: str) -> str:
    value = os.environ.get(name, '').strip()
    if not value:
        raise ValueError(f'Configuração obrigatória ausente: {name}')
    return value


def validate_message(data: dict) -> tuple[str, str, str]:
    execution = data['execution_id']
    container = data['container']
    zip_blob = data['zip_blob']
    manifest_blob = data['manifest_blob']
    if (not isinstance(execution, str) or not execution or '/' in execution or
        not isinstance(container, str) or container != required('PIAGA_REPORT_CONTAINER') or
        not isinstance(zip_blob, str) or not zip_blob.startswith('piaga-tiempo/') or
        not zip_blob.endswith('/relatorio_completo.zip') or
        not isinstance(manifest_blob, str) or manifest_blob != zip_blob.rsplit('/', 1)[0] + '/manifesto.json'):
        raise ValueError('Mensagem da fila inválida ou fora do prefixo autorizado.')
    return execution, container, zip_blob


@app.queue_trigger(arg_name='msg', queue_name='relatorios-prontos', connection='AzureWebJobsStorage')
def enviar_email_relatorio(msg: func.QueueMessage) -> None:
    data = json.loads(msg.get_body().decode('utf-8'))
    execution, container, zip_blob = validate_message(data)

    # Falha explícita enquanto o email não foi provisionado.
    endpoint = required('PIAGA_ACS_ENDPOINT')
    sender = required('PIAGA_REPORT_SENDER')
    recipient = required('PIAGA_REPORT_RECIPIENT')
    account = required('PIAGA_STORAGE_ACCOUNT')
    hours = int(os.getenv('PIAGA_SAS_HOURS', '24'))
    if hours < 1 or hours > 144:
        raise ValueError('PIAGA_SAS_HOURS deve estar entre 1 e 144 horas (até 6 dias).')

    credential = DefaultAzureCredential(exclude_interactive_browser_credential=True)
    blob_service = BlobServiceClient(
        account_url=f'https://{account}.blob.core.windows.net',
        credential=credential,
    )
    zip_client = blob_service.get_blob_client(container, zip_blob)
    zip_props = zip_client.get_blob_properties()
    manifest_blob = data['manifest_blob']
    manifest = json.loads(blob_service.get_blob_client(container, manifest_blob).download_blob().readall())
    if manifest.get('execution_id') != execution or manifest.get('zip_sha256') != zip_props.metadata.get('sha256'):
        raise RuntimeError('Manifesto e ZIP remoto não coincidem; email cancelado.')
    if manifest.get('zip_bytes') != zip_props.size:
        raise RuntimeError('Tamanho do ZIP remoto diferente do manifesto.')

    # Criação condicional bloqueia duplicidades ordinárias do Queue Trigger.
    marker_name = f'_notifications/{execution}.json'
    marker = blob_service.get_blob_client(container, marker_name)
    try:
        marker.upload_blob(
            json.dumps({'execution_id': execution, 'state': 'sending',
                        'created_at': datetime.now(timezone.utc).isoformat()}),
            overwrite=False,
        )
    except ResourceExistsError:
        logging.warning('Email já reservado/processado para %s. Ignorando duplicata.', execution)
        return

    sent_successfully = False
    try:
        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=hours)
        start = now - timedelta(minutes=5)
        user_key = blob_service.get_user_delegation_key(start, expires)
        sas = generate_blob_sas(
            account_name=account,
            container_name=container,
            blob_name=zip_blob,
            user_delegation_key=user_key,
            permission=BlobSasPermissions(read=True),
            start=start,
            expiry=expires,
            protocol='https',
        )
        url = f'{zip_client.url}?{sas}'
        # O link SAS é segredo temporário: nunca registrá-lo em log.
        email_client = EmailClient(endpoint, credential)
        message = {
            'senderAddress': sender,
            'recipients': {'to': [{'address': recipient}]},
            'content': {
                'subject': f'PIAGA-TIEMPO | Relatório {execution}',
                'plainText': (
                    f'Relatório do PIAGA-TIEMPO disponível para download.\n'
                    f'Produtos: {manifest["products"]}\n'
                    f'Planilhas: {manifest["excel_files"]}\n'
                    f'Arquivo ZIP: {manifest["zip_bytes"] / 1024 / 1024:.2f} MB\n'
                    f'Link válido por {hours} horas: {url}\n'
                    'Não encaminhe este link a terceiros.'
                ),
            },
        }
        result = email_client.begin_send(message).result(timeout=120)
        if result.get('status') != 'Succeeded':
            raise RuntimeError(f'Azure Communication Services: {result.get("status")}; {result.get("error")}')
        sent_successfully = True
        marker.upload_blob(
            json.dumps({'execution_id': execution, 'state': 'sent',
                        'email_operation_id': result.get('id'), 'sent_at': datetime.now(timezone.utc).isoformat()}),
            overwrite=True,
        )
        logging.info('E-mail do relatório %s enviado (ACS status Succeeded).', execution)
    except Exception:
        if not sent_successfully:
            # Libera novas tentativas da fila em caso de erro ANTES da confirmação de envio.
            marker.delete_blob()
        raise
