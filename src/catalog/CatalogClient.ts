import axios from "axios";
import { env } from "../config/env";
import { Session } from "../models/Session";
import { PayloadBuilder } from "./PayloadBuilder";
import { CatalogParser } from "./CatalogParser";

export interface PageResult {
    products: any[];
    currentPage: number;
    totalPages: number;
    pageSize: number;
    hasNext: boolean;
    hasPrev: boolean;
}

export class CatalogClient {

    async search(
        session: Session,
        payload: unknown
    ) {
        const response = await axios.post(
            env.CATALOGO_URL,
            payload,
            {
                headers: {
                    Cookie: session.cookies,
                    gxajaxrequest: "1",
                    ajax_security_token: session.ajaxSecurityToken,
                    "x-gxauth-token": session.gxAuthToken,
                    "Content-Type": "application/json"
                }
            }
        );

        return response.data;
    }

    async ping(session: Session): Promise<void> {
        const payload = session.payloadTemplate;
        await this.search(session, payload);
    }

    async fetchPage(
        session: Session,
        page: number,
        pageSize: 10 | 20 | 50 = 10,
        searchTerm: string = "PISTAO"
    ): Promise<PageResult> {
        const builder = new PayloadBuilder(session.payloadTemplate);
        const payload = builder.buildPaginatedSearch(page, pageSize, searchTerm);

        const response = await this.search(session, payload);

        const grid = response?.gxGrids?.[0];
        if (!grid) {
            return {
                products: [],
                currentPage: page,
                totalPages: 1,
                pageSize,
                hasNext: false,
                hasPrev: false
            };
        }

        const parser = new CatalogParser();
        const products = parser.parse(response);

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
            pageSize,
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1
        };
    }

    async fetchAllProducts(
        session: Session,
        pageSize: 10 | 20 | 50 = 10,
        searchTerm: string = "PISTAO",
        delayMs: number = 500
    ): Promise<any[]> {
        const allProducts: any[] = [];
        
        console.log(`🔄 Iniciando coleta do catálogo (termo: "${searchTerm}")...`);
        
        let page = 1;
        let totalPages = 1;
        
        while (page <= totalPages) {
            console.log(`📄 Coletando página ${page} de ${totalPages}...`);
            
            const result = await this.fetchPage(session, page, pageSize, searchTerm);
            
            if (page === 1) {
                totalPages = result.totalPages;
                console.log(`📊 Total de páginas: ${totalPages}`);
            }
            
            allProducts.push(...result.products);
            console.log(`✅ Página ${page} carregada: ${result.products.length} produtos (total: ${allProducts.length})`);
            
            if (!result.hasNext) {
                break;
            }
            
            if (page < totalPages) {
                console.log(`⏳ Aguardando ${delayMs}ms...`);
                await this.delay(delayMs);
            }
            
            page++;
        }
        
        console.log(`🎉 Coleta finalizada! Total: ${allProducts.length} produtos.`);
        return allProducts;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}