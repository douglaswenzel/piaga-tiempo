import { CatalogClient, PageResult } from "./CatalogClient";
import { Session } from "../models/Session";
import { CatalogParser } from "./CatalogParser";
import { PayloadBuilder } from "./PayloadBuilder";

export interface PaginationConfig {
    pageSize: 10 | 20 | 50;
    searchTerm: string;
    delayBetweenPages: number;
    maxPages?: number;
}

export class CatalogPaginator {
    
    private client: CatalogClient;
    private parser: CatalogParser;

    constructor() {
        this.client = new CatalogClient();
        this.parser = new CatalogParser();
    }
    
    async collectAll(
        session: Session,
        config: Partial<PaginationConfig> = {}
    ): Promise<any[]> {
        const finalConfig: PaginationConfig = {
            pageSize: config.pageSize || 10,
            searchTerm: config.searchTerm || "PISTAO",
            delayBetweenPages: config.delayBetweenPages || 500,
            maxPages: config.maxPages
        };

        console.log("Iniciando coleta do catálogo completo...");
        console.log(`Configuração: página ${finalConfig.pageSize} itens, termo "${finalConfig.searchTerm}"`);
        
        const allProducts: any[] = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
            if (finalConfig.maxPages && page > finalConfig.maxPages) {
                console.log(`⏹️ Limite de ${finalConfig.maxPages} páginas atingido.`);
                break;
            }

            console.log(`📄 Buscando página ${page}...`);
            
            const result = await this.fetchPage(session, page, finalConfig);
            
            if (page === 1) {
                totalPages = result.totalPages;
                console.log(`📊 Total de páginas: ${totalPages}`);
                console.log(`📊 Total estimado de produtos: ${totalPages * finalConfig.pageSize}`);
            }

            allProducts.push(...result.products);
            console.log(`✅ Página ${page} OK: ${result.products.length} produtos (total: ${allProducts.length})`);

            if (!result.hasNext || page >= totalPages) {
                break;
            }

            if (page < totalPages) {
                await this.delay(finalConfig.delayBetweenPages);
            }

            page++;
        }

        console.log(`🎉 Coleta finalizada! Total: ${allProducts.length} produtos.`);
        return allProducts;
    }

    async fetchPage(
        session: Session,
        page: number,
        config: PaginationConfig
    ): Promise<PageResult> {
        const builder = new PayloadBuilder(session.payloadTemplate);
        
        const payload = builder.buildPaginatedSearch(
            page,
            config.pageSize,
            config.searchTerm
        );

        const response = await this.client.search(session, payload);

        const products = this.parser.parse(response);

        let currentPage = page;
        let totalPages = 1;

        if (response?.gxValues?.[0]) {
            const values = response.gxValues[0];
            if (values.AV15GridCurrentPage) {
                currentPage = parseInt(values.AV15GridCurrentPage, 10);
            }
            if (values.AV16GridPageCount) {
                totalPages = parseInt(values.AV16GridPageCount, 10);
            }
        }

        return {
            products,
            currentPage,
            totalPages,
            pageSize: config.pageSize,
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1
        };
    }

    async diagnosePagination(
        session: Session,
        searchTerm: string = "PISTAO",
        pagesToTest: number = 5
    ): Promise<void> {
        console.log(`🔍 Diagnosticando paginação para "${searchTerm}"...`);
        console.log(`📄 Testando ${pagesToTest} páginas...`);
        console.log("=".repeat(60));

        const results: any[] = [];

        for (let page = 1; page <= pagesToTest; page++) {
            const result = await this.fetchPage(session, page, {
                pageSize: 10,
                searchTerm,
                delayBetweenPages: 300
            });

            console.log(`📄 Página ${page}:`);
            console.log(`  - Produtos: ${result.products.length}`);
            console.log(`  - Total páginas: ${result.totalPages}`);
            console.log(`  - CurrentPage: ${result.currentPage}`);
            
            const skus = result.products.map((p: any) => p.sku).join(", ");
            console.log(`  - SKUs: ${skus}`);
            console.log("-".repeat(40));

            results.push(result);
        }

        const allSkus = results.flatMap((r: any) => r.products.map((p: any) => p.sku));
        const uniqueSkus = new Set(allSkus);
        
        console.log("📊 Diagnóstico final:");
        console.log(`  - Total SKUs coletados: ${allSkus.length}`);
        console.log(`  - SKUs únicos: ${uniqueSkus.size}`);
        console.log(`  - Duplicatas: ${allSkus.length - uniqueSkus.size}`);
        
        if (allSkus.length === uniqueSkus.size) {
            console.log("✅ NENHUMA duplicata encontrada! Paginação funcionando corretamente.");
        } else {
            console.log("⚠️ ATENÇÃO: Encontradas duplicatas entre páginas.");
        }
        
        console.log("=".repeat(60));
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}