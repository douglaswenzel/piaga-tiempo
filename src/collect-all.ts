import { SessionManager } from "./auth/SessionManager";
import { CatalogPaginator } from "./catalog/CatalogPaginator";
import { CatalogDatabase } from "./database/Database";
import * as fs from 'fs';
import * as path from 'path';

async function collectAllProducts() {
    console.log('COLETA COMPLETA');
    console.log('='.repeat(60));

    const progressFile = path.join(process.cwd(), 'storage', 'progress.json');

    try {
        const sessionManager = new SessionManager();
        const session = await sessionManager.getSession();
        console.log('✅ Sessão obtida');

        const db = new CatalogDatabase();
        const totalAntes = db.countProducts();
        console.log(`📊 Produtos no banco ANTES: ${totalAntes}`);

        const paginator = new CatalogPaginator();
        const SEARCH_TERM = '0'; // '0' = TODOS OS PRODUTOS
        const PAGE_SIZE = 10;    // Servidor parece limitar a 10
        const MAX_PAGES = 0;     // 0 = usar total do servidor

        // 🔄 Retomar de onde parou?
        let startPage = 1;
        if (fs.existsSync(progressFile)) {
            const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
            startPage = progress.page + 1;
            console.log(`🔄 Retomando da página ${startPage}`);
        }

        console.log(`\n📄 Buscando catálogo com termo: "${SEARCH_TERM}"`);
        console.log(`📦 Tamanho da página: ${PAGE_SIZE}`);
        console.log(`📊 Total estimado de páginas: ${MAX_PAGES === 0 ? 'todas' : MAX_PAGES}`);
        console.log('='.repeat(60));

        let totalProdutos = 0;
        let totalInseridos = 0;
        let totalAtualizados = 0;
        let page = startPage;
        let totalPages = MAX_PAGES;
        let consecutiveStalls = 0;

        while (true) {
            console.log(`\n📄 Página ${page}...`);

            try {
                const result = await paginator.fetchPage(session, page, {
                    pageSize: PAGE_SIZE,
                    searchTerm: SEARCH_TERM,
                });

                const products = result.products;

                if (products.length === 0) {
                    console.log(`  ⚠️ Página ${page} vazia - encerrando`);
                    break;
                }

                // Define o total de páginas real na primeira página (ou ao retomar)
                if (page === startPage) {
                    totalPages = result.totalPages || MAX_PAGES;
                    console.log(`  📊 Total real de páginas: ${totalPages}`);
                }

                // Insere/atualiza no banco
                const { inserted, updated } = db.upsertProducts(products);
                totalInseridos += inserted;
                totalAtualizados += updated;
                totalProdutos += products.length;

                const firstSku = products[0]?.sku || 'N/A';
                const lastSku = products[products.length - 1]?.sku || 'N/A';
                console.log(`  ✅ ${products.length} produtos (SKU: ${firstSku} ... ${lastSku})`);
                console.log(`  📥 Novos: ${inserted}, 🔄 Atualizados: ${updated}`);

                // Salva progresso
                fs.writeFileSync(progressFile, JSON.stringify({ page }));

                // Condição de parada: atingiu o total de páginas
                if (totalPages > 0 && page >= totalPages) {
                    console.log(`  🏁 Última página!`);
                    break;
                }

                // Detecta possíveis travamentos (mesmo SKU repetido 3 vezes)
                if (products[0]?.sku === lastSku && products.length > 1) {
                    consecutiveStalls++;
                    console.log(`  ⚠️ Possível travamento (mesmo SKU na página). Tentativa ${consecutiveStalls}/3`);
                    if (consecutiveStalls >= 3) {
                        console.log(`  ❌ Encerrando após 3 travamentos consecutivos.`);
                        break;
                    }
                } else {
                    consecutiveStalls = 0;
                }

                await new Promise(resolve => setTimeout(resolve, 300));
                page++;
            } catch (error) {
                console.error(`  ❌ Erro na página ${page}:`, error);
                break;
            }
        }

        // Remove arquivo de progresso se coleta concluída
        if (fs.existsSync(progressFile)) {
            fs.unlinkSync(progressFile);
        }

        const totalFinal = db.countProducts();
        console.log('\n📊 RESUMO FINAL');
        console.log('='.repeat(60));
        console.log(`  Antes:   ${totalAntes} produtos`);
        console.log(`  Depois:  ${totalFinal} produtos`);
        console.log(`  Novos:   ${totalFinal - totalAntes} produtos`);
        console.log(`  Coletados: ${totalProdutos}`);
        console.log(`  Páginas: ${page - startPage + 1}`);
        console.log(`  Inseridos: ${totalInseridos}`);
        console.log(`  Atualizados: ${totalAtualizados}`);
        console.log('='.repeat(60));

        db.close();

    } catch (error) {
        console.error('❌ Erro:', error);
        process.exit(1);
    }
}

collectAllProducts().catch(console.error);