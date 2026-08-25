import { CatalogDatabase } from '../database/database';
import { CatalogProduct } from '../models/CatalogProduct';

async function testDatabase() {
    console.log('🧪 TESTE DO BANCO DE DADOS');
    console.log('='.repeat(50));

    try {
        const db = new CatalogDatabase();
        console.log('✅ Banco de dados inicializado');

        const testProducts: CatalogProduct[] = [
            {
                sku: 'TEST-001',
                description: 'Produto Teste 1',
                manufacturer: 'Fabricante A',
                group: 'Grupo 1',
                application: 'Aplicação 1',
                price: 99.90,
                stock: 10
            },
            {
                sku: 'TEST-002',
                description: 'Produto Teste 2',
                manufacturer: 'Fabricante B',
                group: 'Grupo 2',
                application: 'Aplicação 2',
                price: 149.50,
                stock: 5
            },
            {
                sku: 'TEST-003',
                description: 'Produto Teste 3',
                manufacturer: 'Fabricante C',
                group: 'Grupo 1',
                application: 'Aplicação 3',
                price: 79.90,
                stock: 0
            }
        ];

        console.log('\n📦 Inserindo produtos de teste...');
        const result = db.upsertProducts(testProducts);
        console.log(`✅ Inseridos: ${result.inserted}, Atualizados: ${result.updated}`);

        console.log('\n🔍 Buscando produto TEST-001...');
        const product = db.getProduct('TEST-001');
        if (product) {
            console.log('✅ Produto encontrado:');
            console.log(`  SKU: ${product.sku}`);
            console.log(`  Descrição: ${product.description}`);
            console.log(`  Fabricante: ${product.manufacturer}`);
            console.log(`  Grupo: ${product.group}`);
            console.log(`  Preço: R$ ${product.price.toFixed(2)}`);
            console.log(`  Estoque: ${product.stock}`);
        }

        console.log('\n📊 Todos os produtos:');
        const allProducts = db.getAllProducts();
        console.table(allProducts.map(p => ({
            SKU: p.sku,
            Descrição: p.description.substring(0, 20),
            Fabricante: p.manufacturer,
            Grupo: p.group,
            Preço: `R$ ${p.price.toFixed(2)}`,
            Estoque: p.stock
        })));

        const count = db.countProducts();
        console.log(`\n📊 Total de produtos: ${count}`);

        console.log('\n🔄 Atualizando produto TEST-001...');
        const updatedProduct: CatalogProduct = {
            sku: 'TEST-001',
            description: 'Produto Teste 1 - ATUALIZADO',
            manufacturer: 'Fabricante A - Novo',
            group: 'Grupo 1',
            application: 'Aplicação 1',
            price: 109.90,
            stock: 15
        };
        db.upsertProduct(updatedProduct);

        const updated = db.getProduct('TEST-001');
        if (updated) {
            console.log('✅ Produto atualizado:');
            console.log(`  Descrição: ${updated.description}`);
            console.log(`  Fabricante: ${updated.manufacturer}`);
            console.log(`  Preço: R$ ${updated.price.toFixed(2)}`);
            console.log(`  Estoque: ${updated.stock}`);
        }

        db.close();
        console.log('\n✅ Teste concluído com sucesso!');

    } catch (error) {
        console.error('❌ Erro no teste:', error);
        if (error instanceof Error) {
            console.error('Mensagem:', error.message);
        }
    }
}

testDatabase().catch(console.error);