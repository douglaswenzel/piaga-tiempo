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

    async search(session: Session, url: string, body: any) {
        const response = await axios.post(url, body, {
            headers: {
                Cookie: session.cookies,
                gxajaxrequest: "1",
                ajax_security_token: session.ajaxSecurityToken,
                "x-gxauth-token": session.gxAuthToken,
                "Content-Type": "application/json"
            }
        });
        return response.data;
    }

    async fetchPage(session: Session, page: number, pageSize: number = 10, searchTerm: string = ''): Promise<PageResult> {
        const builder = new PayloadBuilder(session.payloadTemplate, session.gxEvent);
        const { url, body } = builder.buildPaginatedSearch(page, pageSize, searchTerm);
        const response = await this.search(session, url, body);

        // Extrai produtos
        const parser = new CatalogParser();
        const products = parser.parse(response);

        // Extrai metadados
        let totalPages = 1;
        let currentPage = page;
        if (response?.gxValues?.[0]) {
            if (response.gxValues[0].AV15GridCurrentPage) currentPage = parseInt(response.gxValues[0].AV15GridCurrentPage, 10);
            if (response.gxValues[0].AV16GridPageCount) totalPages = parseInt(response.gxValues[0].AV16GridPageCount, 10);
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

    async ping(session: Session): Promise<void> {
        const builder = new PayloadBuilder(session.payloadTemplate, session.gxEvent);
        const { url, body } = builder.buildPaginatedSearch(1, 10, '');
        await this.search(session, url, body);
    }
}