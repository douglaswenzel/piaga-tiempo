export class PayloadBuilder {

    constructor(
        private readonly template: any
    ) {}

    /**
     * Retorna uma cópia do payload original capturado no login.
     */
    build(): any {

        return structuredClone(this.template);

    }

    /**
     * Busca por SKU.
     */
    searchSku(sku: string): any {

        const payload = this.build();

        payload.parms[0] = sku;

        return payload;

    }

    /**
     * Busca por descrição.
     */
    searchDescription(description: string): any {

        const payload = this.build();

        payload.parms[1] = description;

        return payload;

    }

    /**
     * Busca por fabricante.
     */
    searchManufacturer(manufacturer: string): any {

        const payload = this.build();

        payload.parms[3] = manufacturer;

        return payload;

    }

    /**
     * Busca por grupo.
     */
    searchGroup(group: string): any {

        const payload = this.build();

        payload.parms[4] = group;

        return payload;

    }

    /**
     * Permite alterar qualquer posição do parms.
     */
    setParameter(index: number, value: any): any {

        const payload = this.build();

        payload.parms[index] = value;

        return payload;

    }

}