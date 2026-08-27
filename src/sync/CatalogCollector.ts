import { Session } from '../models/Session';
import { CatalogProduct } from '../models/CatalogProduct';
import { CatalogDatabase } from '../database/Database';
import { CatalogPaginator } from '../catalog/CatalogPaginator';
import { PayloadBuilder } from '../catalog/PayloadBuilder';
import { CatalogClient } from '../catalog/CatalogClient';
import { CatalogParser } from '../catalog/CatalogParser';

export class CatalogCollector {
    private db: CatalogDatabase;
    private client: CatalogClient;
    private parser: CatalogParser;
    private paginator: CatalogPaginator;

    constructor() {
        this.db = new CatalogDatabase();
        this.client = new CatalogClient();
        this.parser = new CatalogParser();
        this.paginator = new CatalogPaginator();
    }

    async collectFullCatalog(
        session: Session,
        pageSize: 10 | 20 | 50 = 50,
        delayMs: number = 300
    ): Promise<{
        totalProdutos: number;
        inseridos: number;
        atualizados: number;
        totalPaginas: number;
    }> {
        console.log('COLETANDO CATÁLOGO COMPLETO');
        console.log('='.repeat(60));

        const startTime = Date.now();
        let totalColetados = 0;
        let totalInseridos = 0;
        let totalAtualizados = 0;
        let paginaAtual = 1;
        let totalPaginas = 1;

        const searchTerm = 'A';
        console.log(`🔍 Buscando catálogo completo com termo: "${searchTerm}"`);
        console.log(`📄 Tamanho da página: ${pageSize}`);

        while (paginaAtual <= totalPaginas) {
            console.log(`\n📄 Coletando página ${paginaAtual}...`);

            try {
                const result = await this.paginator.fetchPage(
                    session,
                    paginaAtual,
                    {
                        pageSize,
                        searchTerm,
                        delayBetweenPages: delayMs
                    }
                );

                if (paginaAtual === 1) {
                    totalPaginas = result.totalPages;
                    console.log(`📊 Total de páginas: ${totalPaginas}`);
                    console.log(`📊 Total estimado de produtos: ${totalPaginas * pageSize}`);
                }

                if (result.products.length === 0 && paginaAtual === 1) {
                    console.log(`⚠️ Nenhum produto encontrado com "${searchTerm}", tentando com "PISTAO"...`);
                    
                    const fallbackResult = await this.paginator.fetchPage(
                        session,
                        1,
                        {
                            pageSize,
                            searchTerm: 'PISTAO',
                            delayBetweenPages: delayMs
                        }
                    );
                    
                    if (fallbackResult.products.length > 0) {
                        totalPaginas = fallbackResult.totalPages;
                        console.log(`✅ Fallback funcionou! Total de páginas: ${totalPaginas}`);
                        
                        const { inserted, updated } = this.db.upsertProducts(fallbackResult.products);
                        totalInseridos += inserted;
                        totalAtualizados += updated;
                        totalColetados += fallbackResult.products.length;
                        console.log(`✅ Página ${paginaAtual}: ${fallbackResult.products.length} produtos (novos: ${inserted}, atualizados: ${updated})`);
                        
                        paginaAtual++;
                        continue;
                    }
                }

                if (result.products.length > 0) {
                    const { inserted, updated } = this.db.upsertProducts(result.products);
                    totalInseridos += inserted;
                    totalAtualizados += updated;
                    totalColetados += result.products.length;

                    console.log(`✅ Página ${paginaAtual}: ${result.products.length} produtos (novos: ${inserted}, atualizados: ${updated})`);
                } else {
                    console.log(`⚠️ Página ${paginaAtual} vazia`);
                }

                if (!result.hasNext || paginaAtual >= totalPaginas) {
                    break;
                }

                paginaAtual++;

                if (paginaAtual <= totalPaginas) {
                    await this.delay(delayMs);
                }

            } catch (error) {
                console.error(`❌ Erro na página ${paginaAtual}:`, error);
                throw error;
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        this.db.logSync({
            tipo: 'coleta_completa',
            status: 'sucesso',
            total_paginas: totalPaginas,
            total_produtos: totalColetados,
            produtos_novos: totalInseridos,
            produtos_atualizados: totalAtualizados,
            detalhes: `Duração: ${duration}s, PageSize: ${pageSize}, Total estimado: ${totalPaginas * pageSize}`
        });

        console.log('\nRESUMO DA COLETA COMPLETA');
        console.log('='.repeat(60));
        console.log(`  Total de produtos: ${totalColetados}`);
        console.log(`  Novos: ${totalInseridos}`);
        console.log(`  Atualizados: ${totalAtualizados}`);
        console.log(`  Páginas: ${totalPaginas}`);
        console.log(`  Tempo: ${duration}s`);
        console.log('='.repeat(60));

        return {
            totalProdutos: totalColetados,
            inseridos: totalInseridos,
            atualizados: totalAtualizados,
            totalPaginas
        };
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    close(): void {
        this.db.close();
    }
}