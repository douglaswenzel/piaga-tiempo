import { env } from "../config/env";

export class PayloadBuilder {
    private gxEvent: string;
    private template: any;

    constructor(template: any, gxEvent: string = '') {
        this.template = template;
        this.gxEvent = gxEvent;
    }

    buildPaginatedSearch(page: number, pageSize: number = 10, searchTerm: string = ''): { url: string, body: any } {
            const payload = JSON.parse(JSON.stringify(this.template));

            if (!payload.parms) payload.parms = [];

            payload.parms[0] = pageSize;
            payload.parms[1] = searchTerm;
            payload.parms[2] = String(page);

            if (!payload.gxValues) payload.gxValues = [{}];
            payload.gxValues[0].AV15GridCurrentPage = String(page);

            const gxQuery = this.gxEvent ? `${this.gxEvent},` : '';
            const baseUrl = `env.CATALOGO_URL${gxQuery}gx-no-cache=${Date.now()}`;

            return { url: baseUrl, body: payload };
        }
}