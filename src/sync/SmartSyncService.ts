import { Session } from '../models/Session';
import { CatalogProduct } from '../models/CatalogProduct';
import { CatalogDatabase } from '../database/Database';  // <- Correção aqui
import { CatalogPaginator } from '../catalog/CatalogPaginator';
import { CatalogClient } from '../catalog/CatalogClient';
import { CatalogParser } from '../catalog/CatalogParser';
import { PayloadBuilder } from '../catalog/PayloadBuilder';

export interface SyncConfig {
    smartMode: boolean;
    batchSize: number;
    delayMs: number;
    searchTerm: string;
    pageSize: 10 | 20 | 50;
    maxPages: number;
    forceUpdate: boolean;
}

export interface SyncResult {
    totalProcessed: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    duration: number;
    batchDetails: BatchDetail[];
}

export interface BatchDetail {
    batchNumber: number;
    productsInBatch: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    duration: number;
}

export class SmartSyncService {
    private db: CatalogDatabase;
    private paginator: CatalogPaginator;
    private client: CatalogClient;
    private parser: CatalogParser;

    constructor() {
        this.db = new CatalogDatabase();
        this.paginator = new CatalogPaginator();
        this.client = new CatalogClient();
        this.parser = new CatalogParser();
    }

    async sync(
        session: Session,
        config: Partial<SyncConfig> = {}
    ): Promise<SyncResult> {
        const startTime = Date.now();

        const finalConfig: SyncConfig = {
            smartMode: config.smartMode ?? true,
            batchSize: config.batchSize ?? 10,
            delayMs: config.delayMs ?? 300,
            searchTerm: config.searchTerm ?? 'PISTAO',
            pageSize: config.pageSize ?? 50,
            maxPages: config.maxPages ?? 0,
            forceUpdate: config.forceUpdate ?? false
        };

        console.log('INICIANDO SINCRONIZAÇÃO INTELIGENTE');
        console.log('='.repeat(60));
        console.log(`Modo: ${finalConfig.smartMode ? 'INTELIGENTE' : 'FORÇADO'}`);
        console.log(`Tamanho do lote: ${finalConfig.batchSize}`);
        console.log(`Termo de busca: "${finalConfig.searchTerm}"`);
        console.log(`Forçar atualização: ${finalConfig.forceUpdate ? 'SIM' : 'NÃO'}`);
        console.log('='.repeat(60));

        const result: SyncResult = {
            totalProcessed: 0,
            inserted: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            duration: 0,
            batchDetails: []
        };

        try {
            const lastSync = this.db.getLastSync('coleta');
            const lastSyncDate = lastSync?.data_execucao 
                ? new Date(lastSync.data_execucao) 
                : null;

            if (lastSyncDate && finalConfig.smartMode) {
                console.log(`📅 Última sincronização: ${lastSyncDate.toLocaleString()}`);
                console.log(`🔍 Modo inteligente: só produtos atualizados após ${lastSyncDate.toLocaleString()}`);
            } else if (finalConfig.smartMode) {
                console.log('🆕 Primeira sincronização - todos os produtos serão inseridos');
            }

            console.log('\n📦 Coletando produtos do catálogo...');
            const allProducts = await this.collectProducts(session, finalConfig);

            if (allProducts.length === 0) {
                console.log('⚠️ Nenhum produto encontrado');
                result.duration = Date.now() - startTime;
                return result;
            }

            console.log(`✅ ${allProducts.length} produtos coletados`);

            console.log(`\n📦 Processando em lotes de ${finalConfig.batchSize}...`);
            
            const batches = this.splitIntoBatches(allProducts, finalConfig.batchSize);
            console.log(`📊 Total de lotes: ${batches.length}`);

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const batchNumber = i + 1;
                
                console.log(`\n🔄 Lote ${batchNumber}/${batches.length} (${batch.length} produtos)`);
                
                const batchStart = Date.now();
                const batchResult = await this.processBatch(
                    batch,
                    finalConfig,
                    lastSyncDate
                );

                result.totalProcessed += batchResult.totalProcessed;
                result.inserted += batchResult.inserted;
                result.updated += batchResult.updated;
                result.skipped += batchResult.skipped;
                result.errors += batchResult.errors;

                result.batchDetails.push({
                    batchNumber,
                    productsInBatch: batch.length,
                    inserted: batchResult.inserted,
                    updated: batchResult.updated,
                    skipped: batchResult.skipped,
                    errors: batchResult.errors,
                    duration: Date.now() - batchStart
                });

                console.log(`✅ Lote ${batchNumber} concluído: ` +
                    `+${batchResult.inserted} inseridos, ` +
                    `~${batchResult.updated} atualizados, ` +
                    `-${batchResult.skipped} ignorados`);

                if (i < batches.length - 1) {
                    await this.delay(finalConfig.delayMs);
                }
            }

            this.db.logSync({
                tipo: 'coleta',
                status: 'sucesso',
                total_produtos: result.totalProcessed,
                produtos_novos: result.inserted,
                produtos_atualizados: result.updated,
                detalhes: JSON.stringify({
                    smartMode: finalConfig.smartMode,
                    batchSize: finalConfig.batchSize,
                    searchTerm: finalConfig.searchTerm,
                    skipped: result.skipped,
                    batches: result.batchDetails.length
                })
            });

            result.duration = Date.now() - startTime;

            this.showSummary(result);

            return result;

        } catch (error) {
            console.error('Erro na sincronização:', error);
            
            this.db.logSync({
                tipo: 'coleta',
                status: 'falha',
                erro: error instanceof Error ? error.message : String(error)
            });

            result.duration = Date.now() - startTime;
            result.errors++;
            throw error;
        } finally {
            this.db.close();
        }
    }

    private async collectProducts(
        session: Session,
        config: SyncConfig
    ): Promise<CatalogProduct[]> {
        const allProducts: CatalogProduct[] = [];
        let page = 1;
        let totalPages = 1;
        let isEmptySearch = !config.searchTerm || config.searchTerm.trim() === '';

        const searchTerm = isEmptySearch ? 'A' : config.searchTerm;

        console.log(`  🔍 Buscando: "${searchTerm}" ${isEmptySearch ? '(catálogo completo)' : ''}`);

        while (page <= totalPages) {
            console.log(`  📄 Página ${page}...`);

            try {
                const result = await this.paginator.fetchPage(
                    session,
                    page,
                    {
                        pageSize: config.pageSize,
                        searchTerm: searchTerm,
                        delayBetweenPages: config.delayMs
                    }
                );

                if (page === 1) {
                    totalPages = result.totalPages;
                    console.log(`Total de páginas: ${totalPages}`);
                    
                    if (config.maxPages > 0 && config.maxPages < totalPages) {
                        totalPages = config.maxPages;
                        console.log(`  ⏹️ Limitado a ${totalPages} páginas`);
                    }
                }

                if (result.products.length === 0 && isEmptySearch) {
                    console.log(`Nenhum produto encontrado com "A", tentando "PISTAO"...`);
                    const fallbackResult = await this.paginator.fetchPage(
                        session,
                        page,
                        {
                            pageSize: config.pageSize,
                            searchTerm: 'PISTAO',
                            delayBetweenPages: config.delayMs
                        }
                    );
                    
                    if (fallbackResult.products.length > 0) {
                        allProducts.push(...fallbackResult.products);
                        console.log(`  ✅ ${fallbackResult.products.length} produtos (fallback)`);
                    }
                    
                    break;
                }

                allProducts.push(...result.products);
                console.log(`  ✅ ${result.products.length} produtos`);

                if (!result.hasNext || page >= totalPages) {
                    break;
                }

                page++;

                if (page <= totalPages) {
                    await this.delay(config.delayMs);
                }

            } catch (error) {
                console.error(`Erro na página ${page}:`, error);
                throw error;
            }
        }

        return allProducts;
    }

    private async processBatch(
        products: CatalogProduct[],
        config: SyncConfig,
        lastSyncDate: Date | null
    ): Promise<{
        totalProcessed: number;
        inserted: number;
        updated: number;
        skipped: number;
        errors: number;
    }> {
        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        let errors = 0;

        for (const product of products) {
            try {
                const shouldUpdate = await this.shouldUpdateProduct(
                    product,
                    config,
                    lastSyncDate
                );

                if (!shouldUpdate) {
                    skipped++;
                    continue;
                }

                const existing = this.db.getProduct(product.sku);
                this.db.upsertProduct(product);

                if (existing) {
                    updated++;
                } else {
                    inserted++;
                }

            } catch (error) {
                errors++;
                console.error(`  ❌ Erro ao processar ${product.sku}:`, error);
            }
        }

        return {
            totalProcessed: products.length,
            inserted,
            updated,
            skipped,
            errors
        };
    }
    private async shouldUpdateProduct(
        product: CatalogProduct,
        config: SyncConfig,
        lastSyncDate: Date | null
    ): Promise<boolean> {
        if (config.forceUpdate) {
            return true;
        }

        if (!config.smartMode) {
            return true;
        }

        if (!lastSyncDate) {
            return true;
        }

        const existing = this.db.getProduct(product.sku);
        
        if (!existing) {
            return true;
        }

        const hasChanged = 
            existing.price !== product.price ||
            existing.stock !== product.stock ||
            existing.description !== product.description ||
            existing.manufacturer !== product.manufacturer ||
            existing.group !== product.group ||
            existing.application !== product.application;

        return hasChanged;
    }

    private splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    private showSummary(result: SyncResult): void {
        console.log('\nRESUMO DA SINCRONIZAÇÃO');
        console.log('='.repeat(60));
        console.log(`  Total processado: ${result.totalProcessed}`);
        console.log(`  Inseridos:        ${result.inserted} `);
        console.log(`  Atualizados:      ${result.updated}  `);
        console.log(`  Ignorados:        ${result.skipped}`);
        console.log(`  Erros:            ${result.errors}`);
        console.log(`  Tempo total:      ${(result.duration / 1000).toFixed(2)}s`);
        console.log('='.repeat(60));

        if (result.batchDetails.length > 0) {
            console.log('\nDetalhes por lote:');
            console.table(result.batchDetails.map(b => ({
                Lote: b.batchNumber,
                Produtos: b.productsInBatch,
                Inseridos: b.inserted,
                Atualizados: b.updated,
                Ignorados: b.skipped,
                Erros: b.errors,
                Tempo: `${(b.duration / 1000).toFixed(2)}s`
            })));
        }

        const totalChanged = result.inserted + result.updated;
        const efficiency = result.totalProcessed > 0 
            ? ((totalChanged / result.totalProcessed) * 100).toFixed(1)
            : '0.0';
        
        console.log(`\n📈 Eficiência: ${efficiency}% dos produtos foram alterados`);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    close(): void {
        this.db.close();
    }
}