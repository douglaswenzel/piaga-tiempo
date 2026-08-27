import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { CatalogProduct } from '../models/CatalogProduct';

export class CatalogDatabase {
    private db: Database.Database;
    private dbPath: string;

    constructor() {
        this.dbPath = path.join(process.cwd(), 'data', 'catalog.db');
        this.ensureDirectory();
        this.db = new Database(this.dbPath);
        this.createTable();
        this.createSyncLogTable();
    }

    private ensureDirectory(): void {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Diretório criado: ${dir}`);
        }
    }

    private createTable(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS products (
                sku TEXT PRIMARY KEY,
                description TEXT,
                manufacturer TEXT,
                group_name TEXT,
                application TEXT,
                price REAL,
                stock REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_sku ON products(sku);
            CREATE INDEX IF NOT EXISTS idx_manufacturer ON products(manufacturer);
        `);

        console.log('✅ Tabela products criada/verificada');
    }

    private createSyncLogTable(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data_execucao DATETIME DEFAULT CURRENT_TIMESTAMP,
                tipo TEXT NOT NULL,
                status TEXT NOT NULL,
                total_paginas INTEGER,
                total_produtos INTEGER,
                produtos_novos INTEGER,
                produtos_atualizados INTEGER,
                erro TEXT,
                detalhes TEXT
            )
        `);

        console.log('✅ Tabela sync_log criada/verificada');
    }

    upsertProduct(product: CatalogProduct): void {
        const stmt = this.db.prepare(`
            INSERT INTO products (
                sku, description, manufacturer, group_name, 
                application, price, stock, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(sku) DO UPDATE SET
                description = excluded.description,
                manufacturer = excluded.manufacturer,
                group_name = excluded.group_name,
                application = excluded.application,
                price = excluded.price,
                stock = excluded.stock,
                updated_at = CURRENT_TIMESTAMP
        `);

        stmt.run(
            product.sku,
            product.description || '',
            product.manufacturer || '',
            product.group || '',
            product.application || '',
            product.price || 0,
            product.stock || 0
        );
    }

    upsertProducts(products: CatalogProduct[]): { inserted: number; updated: number } {
        let inserted = 0;
        let updated = 0;

        const stmt = this.db.prepare(`
            INSERT INTO products (
                sku, description, manufacturer, group_name, 
                application, price, stock, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(sku) DO UPDATE SET
                description = excluded.description,
                manufacturer = excluded.manufacturer,
                group_name = excluded.group_name,
                application = excluded.application,
                price = excluded.price,
                stock = excluded.stock,
                updated_at = CURRENT_TIMESTAMP
        `);

        const insertMany = this.db.transaction((items: CatalogProduct[]) => {
            for (const product of items) {
                const existing = this.getProduct(product.sku);
                
                stmt.run(
                    product.sku,
                    product.description || '',
                    product.manufacturer || '',
                    product.group || '',
                    product.application || '',
                    product.price || 0,
                    product.stock || 0
                );

                if (existing) {
                    updated++;
                } else {
                    inserted++;
                }
            }
        });

        insertMany(products);
        
        return { inserted, updated };
    }

    getProduct(sku: string): CatalogProduct | null {
        const stmt = this.db.prepare(`
            SELECT 
                sku,
                description,
                manufacturer,
                group_name,
                application,
                price,
                stock
            FROM products 
            WHERE sku = ?
        `);

        const row = stmt.get(sku) as any;
        if (!row) return null;

        return {
            sku: row.sku,
            description: row.description || '',
            manufacturer: row.manufacturer || '',
            group: row.group_name || '',
            application: row.application || '',
            price: row.price || 0,
            stock: row.stock || 0
        };
    }

    getAllProducts(): CatalogProduct[] {
        const stmt = this.db.prepare(`
            SELECT 
                sku,
                description,
                manufacturer,
                group_name,
                application,
                price,
                stock
            FROM products 
            ORDER BY sku
        `);

        const rows = stmt.all() as any[];
        return rows.map((row) => ({
            sku: row.sku,
            description: row.description || '',
            manufacturer: row.manufacturer || '',
            group: row.group_name || '',
            application: row.application || '',
            price: row.price || 0,
            stock: row.stock || 0
        }));
    }

    countProducts(): number {
        const stmt = this.db.prepare('SELECT COUNT(*) as total FROM products');
        const result = stmt.get() as any;
        return result.total;
    }

    getLastSync(tipo?: string): any {
        let query = `
            SELECT * FROM sync_log 
            ${tipo ? 'WHERE tipo = ?' : ''}
            ORDER BY data_execucao DESC 
            LIMIT 1
        `;

        const stmt = this.db.prepare(query);
        return tipo ? stmt.get(tipo) : stmt.get();
    }

    logSync(data: {
        tipo: string;
        status: 'sucesso' | 'falha' | 'parcial';
        total_paginas?: number;
        total_produtos?: number;
        produtos_novos?: number;
        produtos_atualizados?: number;
        erro?: string;
        detalhes?: string;
    }): void {
        const stmt = this.db.prepare(`
            INSERT INTO sync_log (
                tipo, status, total_paginas, total_produtos,
                produtos_novos, produtos_atualizados, erro, detalhes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            data.tipo,
            data.status,
            data.total_paginas || 0,
            data.total_produtos || 0,
            data.produtos_novos || 0,
            data.produtos_atualizados || 0,
            data.erro || null,
            data.detalhes || null
        );
    }

    close(): void {
        this.db.close();
        console.log('🔒 Banco de dados fechado');
    }

    getDb(): Database.Database {
        return this.db;
    }
}