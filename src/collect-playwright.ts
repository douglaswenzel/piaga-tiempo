import { chromium, type Page } from "playwright";
import { env } from "./config/env";
import { CatalogDatabase } from "./database/Database";
import { CatalogParser } from "./catalog/CatalogParser";
import type { CatalogProduct } from "./models/CatalogProduct";
import type { Product } from "./database/Database"


function toDbProduct(p: CatalogProduct): Product {
    return {
        sku: p.sku,
        description: p.description,
        manufacturer: p.manufacturer,
        group_name: p.group,   // ← único campo que muda de nome
        price: p.price,
        stock: p.stock,
    };
}

async function closeAnnouncementPopup(page: Page) {
    const selectors = [
        "span.gx-popup-close",
        ".gx-popup-close",
        '[id$="_cls"].gx-popup-close'
    ];

    // Dá uma janela curta para o popup aparecer
    await page.waitForTimeout(800);

    for (let attempt = 1; attempt <= 3; attempt++) {
        for (const frame of page.frames()) {
            for (const sel of selectors) {
                try {
                    const btn = frame.locator(sel).first();
                    if ((await btn.count()) > 0 && (await btn.isVisible())) {
                        await btn.click({ timeout: 3000 });
                        console.log(`✅ Popup de anúncio fechado (${sel})`);
                        // pequena pausa para o DOM se estabilizar
                        await page.waitForTimeout(400);
                        return true;
                    }
                } catch {
                    // tenta o próximo seletor / frame
                }
            }
        }
        await page.waitForTimeout(500);
    }

    console.log("ℹ️ Nenhum popup de anúncio detectado (seguindo em frente).");
    return false;
}

async function collectAllWithPlaywright() {
    console.log("🚀 Coleta via Playwright...");

    const browser = await chromium.launch({
        headless: env.HEADLESS,
        slowMo: env.HEADLESS ? 0 : 100,
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Login
    console.log("Abrindo catálogo...");
    await page.goto(env.CATALOGO_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    const frame = page.frameLocator('iframe[title="Logincatalogo"]');
    await frame.getByRole("textbox", { name: "Email", exact: true }).fill(env.EMAIL);
    await frame.getByRole("textbox", { name: "Senha", exact: true }).fill(env.SENHA);

    // Captura a primeira resposta do login (a que contém produtos)
    const loginResponsePromise = page.waitForResponse(
        res => {
            if (res.url().includes("Catalogo.aspx") && res.status() === 200) {
                // Verifica se a resposta tem gxGrids com produtos
                return res.json().then(data => {
                    if (data.gxGrids && data.gxGrids.length > 0) return true;
                    return false;
                }).catch(() => false);
            }
            return false;
        },
        { timeout: 30000 }
    );

    await frame.getByRole("button", { name: "Login" }).click();
    const loginResponse = await loginResponsePromise;
    const firstPageData = await loginResponse.json();
    console.log("✅ Login realizado – primeira página capturada");

    await closeAnnouncementPopup(page);

    const db = new CatalogDatabase();

    // 👇 await — agora é assíncrono (Neon)
    const totalAntes = await db.countProducts();
    console.log(`📊 Produtos no banco ANTES: ${totalAntes}`);

    const parser = new CatalogParser();
    const firstProducts = parser.parse(firstPageData);
    if (firstProducts.length > 0) {
        // 👇 await — upsert em transação HTTP
        const { inserted, updated } = await db.upsertProducts(firstProducts.map(toDbProduct));
        console.log(`✅ Página 1: ${firstProducts.length} produtos (novos: ${inserted}, atualizados: ${updated})`);
    }

    let pagina = 1;
    let totalColetados = firstProducts.length;

    // Loop de paginação
    while (true) {
        // Seletor do botão "Seg"
        const nextButton = page.locator('li.next a').first();
        if (await nextButton.count() === 0) {
            console.log("🏁 Botão de próxima página não encontrado. Fim da coleta.");
            break;
        }

        // Guarda a promise da resposta CORRETA (que contém produtos)
        const responsePromise = page.waitForResponse(
            res => {
                if (res.url().includes("Catalogo.aspx") && res.status() === 200) {
                    // Verifica se a resposta tem gxGrids com produtos
                    return res.json().then(data => {
                        if (data.gxGrids && data.gxGrids.length > 0) return true;
                        return false;
                    }).catch(() => false);
                }
                return false;
            },
            { timeout: 15000 }
        );

        // Loga o que será enviado (opcional)
        console.log("🔎 Clicando em 'Seg'...");
        await nextButton.click();

        // Aguarda a resposta com produtos
        const response = await responsePromise;
        const data = await response.json();

        const products = parser.parse(data);
        if (products.length === 0) {
            console.log("🏁 Página vazia. Fim da coleta.");
            break;
        }

        // 👇 await — upsert em transação HTTP
        const { inserted, updated } = await db.upsertProducts(products.map(toDbProduct));
        totalColetados += products.length;
        pagina++;
        console.log(`✅ Página ${pagina}: ${products.length} produtos (novos: ${inserted}, atualizados: ${updated})`);

        await page.waitForTimeout(300);
    }

    // 👇 await — agora é assíncrono (Neon)
    const totalFinal = await db.countProducts();
    console.log("\n📊 RESUMO FINAL");
    console.log("=".repeat(60));
    console.log(`  Antes:   ${totalAntes}`);
    console.log(`  Depois:  ${totalFinal}`);
    console.log(`  Novos:   ${totalFinal - totalAntes}`);
    console.log(`  Coletados: ${totalColetados}`);
    console.log("=".repeat(60));

    // 👇 await — no-op com driver HTTP, mas mantém a interface consistente
    await db.close();
    await browser.close();
}

collectAllWithPlaywright().catch(console.error);