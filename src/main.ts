import { SessionManager } from "./auth/SessionManager";
import { SmartSyncService } from "./sync/SmartSyncService";
import { CatalogDatabase } from "./database/Database";

const SYNC_CONFIG = {
    smartMode: true,
    
    batchSize: 10,
    
    delayMs: 300,
    
    searchTerm: '',  // <-- VAZIO = CATÁLOGO COMPLETO
    
    pageSize: 50 as 10 | 20 | 50,
    
    maxPages: 0,  // 0 = TODAS as páginas
    
    forceUpdate: false
};

async function main() {
    console.log('PIAGA-TIEMPO - SINCRONIZAÇÃO COMPLETA');
    console.log('='.repeat(60));
    console.log('📋 Coletando TODO o catálogo (sem filtro)');
    console.log('='.repeat(60));

    try {
        const db = new CatalogDatabase();
        const totalAntes = db.countProducts();
        console.log(`📊 Produtos no banco ANTES: ${totalAntes}`);
        db.close();

        const sessionManager = new SessionManager();
        const session = await sessionManager.getSession();
        console.log('✅ Sessão obtida com sucesso!');

        const syncService = new SmartSyncService();
        const result = await syncService.sync(session, SYNC_CONFIG);

        const dbDepois = new CatalogDatabase();
        const totalDepois = dbDepois.countProducts();
        dbDepois.close();

        console.log('\nRESUMO FINAL');
        console.log('='.repeat(60));
        console.log(`  Antes:  ${totalAntes} produtos`);
        console.log(`  Depois: ${totalDepois} produtos`);
        console.log(`  Novos:  ${totalDepois - totalAntes} produtos`);
        console.log(`  Tempo:  ${(result.duration / 1000).toFixed(2)}s`);
        console.log('='.repeat(60));

        console.log('\n✅ Sincronização completa concluída com sucesso!');

    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        if (error instanceof Error) {
            console.error('Mensagem:', error.message);
        }
        process.exit(1);
    }
}

main().catch(console.error);