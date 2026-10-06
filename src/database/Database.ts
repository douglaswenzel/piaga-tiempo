import { neon } from '@neondatabase/serverless';
import { env } from '../config/env';

export interface Product {
    sku: string;
    description: string;
    manufacturer: string;
    group_name: string;
    price: number;
    stock: number;
}

export class CatalogDatabase {
    private sql;

    constructor() {
        this.sql = neon(env.DATABASE_URL);
    }

    /** Conta produtos na tabela. */
    async countProducts(): Promise<number> {
        const rows = await this.sql`SELECT COUNT(*)::int AS c FROM products`;
        return rows[0]?.c ?? 0;
    }

    /**
     * Upsert em lote. Um INSERT ... ON CONFLICT por produto,
     * executado em uma única transação HTTP (sql.transaction).
     * Retorna { inserted, updated }.
     */
    async upsertProducts(products: Product[]): Promise<{ inserted: number; updated: number }> {
        if (products.length === 0) return { inserted: 0, updated: 0 };

        const queries = products.map(p => this.sql`
            INSERT INTO products (sku, description, manufacturer, group_name, price, stock)
            VALUES (${p.sku}, ${p.description}, ${p.manufacturer}, ${p.group_name}, ${p.price}, ${p.stock})
            ON CONFLICT (sku) DO UPDATE SET
                description  = EXCLUDED.description,
                manufacturer = EXCLUDED.manufacturer,
                group_name   = EXCLUDED.group_name,
                price        = EXCLUDED.price,
                stock        = EXCLUDED.stock,
                updated_at   = NOW()
            RETURNING (xmax = 0) AS inserted
        `);

        // sql.transaction executa tudo numa única ida ao servidor
        const results = await this.sql.transaction(queries);

        let inserted = 0;
        let updated = 0;
        for (const r of results) {
            if (r?.[0]?.inserted) inserted++;
            else updated++;
        }
        return { inserted, updated };
    }

    async getDistinctManufacturers(): Promise<string[]> {
        const rows = await this.sql`
            SELECT DISTINCT manufacturer
            FROM products
            WHERE manufacturer IS NOT NULL AND manufacturer <> ''
            ORDER BY manufacturer
        `;
        return rows.map(r => r.manufacturer);
    }

    async getDistinctGroups(): Promise<string[]> {
        const rows = await this.sql`
            SELECT DISTINCT group_name
            FROM products
            WHERE group_name IS NOT NULL AND group_name <> ''
            ORDER BY group_name
        `;
        return rows.map(r => r.group_name);
    }

    /** No-op: o driver HTTP do Neon não mantém conexão persistente. */
    async close(): Promise<void> {}
}