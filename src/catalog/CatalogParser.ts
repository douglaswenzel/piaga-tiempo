import { CatalogProduct } from "../models/CatalogProduct";

export class CatalogParser {

    parse(response: any): CatalogProduct[] {

        if (!response?.gxGrids?.length) {
            return [];
        }

        const grid = response.gxGrids[0];

        const products: CatalogProduct[] = [];

        for (const key of Object.keys(grid)) {

            if (!/^\d+$/.test(key))
                continue;

            const row = grid[key];

            if (!row?.Props)
                continue;

            products.push(this.parseRow(row.Props));
        }

        return products;
    }

    private parseRow(props: any[]): CatalogProduct {

        return {

            sku: this.get(props, "PROCODFAB"),

            description: this.get(props, "PRODES"),

            manufacturer: this.get(props, "FABDES"),

            group: this.get(props, "GRUDES"),

            application: this.get(props, "PROAPLICACAOBUSCA"),

            price: this.money(
                this.get(props, "vBRANCO")
            ),

            stock: this.number(
                this.get(props, "vBRANCOESTOQUE")
            )

        };

    }

    private get(props: any[], prefix: string): string {

        const item = props.find(
            p => String(p[0]).startsWith(prefix)
        );

        if (!item)
            return "";

        return String(item[item.length - 1]).trim();

    }

    private money(value: string): number {

        return Number(
            value
                .replace("R$", "")
                .replace(/\./g, "")
                .replace(",", ".")
                .trim()
        ) || 0;

    }

    private number(value: string): number {

        return Number(
            value
                .replace(/\./g, "")
                .replace(",", ".")
                .trim()
        ) || 0;

    }

}