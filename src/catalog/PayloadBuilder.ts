import { env } from "../config/env";

export class PayloadBuilder {
    private gxEvent: string;
    private template: any;

    constructor(template: any, gxEvent: string = '') {
        this.template = template;
        this.gxEvent = gxEvent;
    }

    buildPaginatedSearch(page: number, pageSize: number = 10, searchTerm: string = '0'): { url: string, body: any } {
        const payload = JSON.parse(JSON.stringify(this.template));
        if (!payload.parms) payload.parms = [];

        // Ajustes para paginação (apenas esses 3 campos)
        payload.parms[0] = String(pageSize);
        payload.parms[1] = searchTerm;
        payload.parms[19] = String(page);

        // ✅ URL CORRETA
        const gxQuery = this.gxEvent ? `${this.gxEvent},` : '';
        const baseUrl = `${env.CATALOGO_URL}?${gxQuery}gx-no-cache=${Date.now()}`;

        return { url: baseUrl, body: payload };
    }
}