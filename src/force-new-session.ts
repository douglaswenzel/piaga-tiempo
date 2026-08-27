import { LoginService } from "./auth/LoginService";
import { CatalogClient } from "./catalog/CatalogClient";
import { PayloadBuilder } from "./catalog/PayloadBuilder";
import * as fs from 'fs';
import * as path from 'path';

async function forceNewSession() {
    console.log('FORÇANDO NOVA SESSÃO COM PAYLOAD CORRETO');
    console.log('='.repeat(60));

    try {
        const sessionPath = path.join(process.cwd(), 'storage', 'session.json');
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
            console.log('✅ Sessão antiga removida');
        }

        console.log('📤 Realizando novo login...');
        const loginService = new LoginService();
        const session = await loginService.login();
        console.log('✅ Login realizado');

        const dir = path.dirname(sessionPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(sessionPath, JSON.stringify(session, null, 4));
        console.log('✅ Nova sessão salva');

        console.log('\n🧪 TESTANDO NOVA SESSÃO...');
        const client = new CatalogClient();
        const builder = new PayloadBuilder(session.payloadTemplate, session.gxEvent);
        
        const { url, body } = builder.buildPaginatedSearch(1, 10, 'PISTAO');
        console.log('📤 Enviando URL:', url);
        console.log('📤 Enviando Body:', JSON.stringify(body, null, 2).substring(0, 500) + '...');
        
        const response = await client.search(session, url, body);
        
        const parser = new (require('./catalog/CatalogParser').CatalogParser)();
        const products = parser.parse(response);
        
        if (products.length > 0) {
            console.log(`✅ Teste bem-sucedido! ${products.length} produtos`);
            console.log(`📌 Primeiro SKU: ${products[0].sku}`);
            if (products[0].sku !== 'PFP-01') {
                console.log('🎉 SUCESSO! A paginação deve funcionar agora!');
            } else {
                console.log('⚠️ Ainda é PFP-01 - verifique se o termo foi enviado corretamente');
            }
        } else {
            console.log('❌ Nenhum produto retornado');
        }

    } catch (error) {
        console.error('❌ Erro:', error);
        process.exit(1);
    }
}

forceNewSession().catch(console.error);