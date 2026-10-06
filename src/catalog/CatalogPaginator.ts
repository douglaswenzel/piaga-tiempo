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

    constructor() {
        this.client = new CatalogClient();
    }

    async fetchPage(session: Session, page: number, config: PaginationConfig = {}): Promise<PageResult> {
        const pageSize = config.pageSize || 10;
        const searchTerm = config.searchTerm || '0';
        return this.client.fetchPage(session, page, pageSize, searchTerm);
    }
}