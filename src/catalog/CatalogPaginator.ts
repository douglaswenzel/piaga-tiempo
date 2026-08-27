import { CatalogClient, PageResult } from "./CatalogClient";
import { Session } from "../models/Session";

export interface PaginationConfig {
    pageSize?: number;
    searchTerm?: string;
    delayBetweenPages?: number;
    maxPages?: number;
}

export class CatalogPaginator {
    private client: CatalogClient;
    private cachedTotalPages = 0;

    constructor() {
        this.client = new CatalogClient();
    }

    async fetchPage(session: Session, page: number, config: PaginationConfig = {}): Promise<PageResult> {
        const pageSize = config.pageSize || 10;
        const searchTerm = config.searchTerm || '';
        const result = await this.client.fetchPage(session, page, pageSize, searchTerm);

        if (page === 1 && result.totalPages > 0) {
            this.cachedTotalPages = result.totalPages;
        }

        if (result.totalPages === 0 && this.cachedTotalPages > 0) {
            result.totalPages = this.cachedTotalPages;
        }

        return result;
    }
}