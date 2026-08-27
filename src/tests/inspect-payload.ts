import { SessionManager } from "../auth/SessionManager";
import * as fs from 'fs';

async function inspectPayload() {
    console.log('🔍 INSPECIONANDO PAYLOAD ORIGINAL');
    console.log('='.repeat(60));

    try {
        const sessionManager = new SessionManager();
        const session = await sessionManager.getSession();
        console.log('✅ Sessão obtida');

        const payload = session.payloadTemplate;
        
        console.log('\n📋 ESTRUTURA DO PAYLOAD:');
        console.log('-'.repeat(40));
        console.log(JSON.stringify(payload, null, 2));

        fs.writeFileSync('payload-original.json', JSON.stringify(payload, null, 2));
        console.log('\n✅ Payload salvo em payload-original.json');

        console.log('\nANÁLISE DO PAYLOAD:');
        console.log('-'.repeat(40));
        
        if (payload.gxValues) {
            console.log('✅ gxValues existe');
            console.log(`   Tipo: ${Array.isArray(payload.gxValues) ? 'Array' : 'Objeto'}`);
            console.log(`   Conteúdo:`, JSON.stringify(payload.gxValues, null, 2));
        } else {
            console.log('❌ gxValues NÃO existe!');
        }

        if (payload.gxHiddens) {
            console.log('✅ gxHiddens existe');
            console.log(`   Chaves:`, Object.keys(payload.gxHiddens));
        } else {
            console.log('❌ gxHiddens NÃO existe!');
        }

        if (payload.parms) {
            console.log('✅ parms existe');
            console.log(`   parms[2] (tamanho): ${payload.parms[2]}`);
            console.log(`   parms[1] (busca): ${payload.parms[1]}`);
        }

    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

inspectPayload().catch(console.error);