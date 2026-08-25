export class PayloadBuilder {

    constructor(
        private readonly template: any
    ) {}

    build(): any {
        return structuredClone(this.template);
    }

    searchSku(sku: string): any {
        const payload = this.build();
        payload.parms[0] = sku;
        return payload;
    }

    searchDescription(description: string): any {
        const payload = this.build();
        payload.parms[1] = description;
        return payload;
    }

    searchManufacturer(manufacturer: string): any {
        const payload = this.build();
        payload.parms[3] = manufacturer;
        return payload;
    }

    searchGroup(group: string): any {
        const payload = this.build();
        payload.parms[4] = group;
        return payload;
    }

    setPageSize(size: 10 | 20 | 50): any {
        const payload = this.build();
        payload.parms[2] = size;
        return payload;
    }

    setCurrentPage(page: number): any {
        const payload = this.build();
        
        if (!payload.gxValues || !Array.isArray(payload.gxValues) || payload.gxValues.length === 0) {
            payload.gxValues = [{}];
        }
        
        payload.gxValues[0].AV15GridCurrentPage = String(page);
        
        return payload;
    }

    buildPaginatedSearch(page: number, pageSize: 10 | 20 | 50 = 10, searchTerm: string = "PISTAO"): any {
        const payload = this.build();
        
        payload.parms[1] = searchTerm;
        payload.parms[2] = pageSize;
        
        if (!payload.gxValues || !Array.isArray(payload.gxValues) || payload.gxValues.length === 0) {
            payload.gxValues = [{}];
        }
        payload.gxValues[0].AV15GridCurrentPage = String(page);
        
        return payload;
    }

    
    setParameter(index: number, value: any): any {
        const payload = this.build();
        payload.parms[index] = value;
        return payload;
    }

    setGxValues(values: Record<string, any>): any {
        const payload = this.build();
        
        if (!payload.gxValues || !Array.isArray(payload.gxValues) || payload.gxValues.length === 0) {
            payload.gxValues = [{}];
        }
        
        Object.assign(payload.gxValues[0], values);
        
        return payload;
    }
}