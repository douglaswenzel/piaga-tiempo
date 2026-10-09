
import { chromium, type Page } from "playwright";
import { env } from "./config/env";
import { CatalogDatabase } from "./database/Database";
import { CatalogParser } from "./catalog/CatalogParser";
import type { CatalogProduct } from "./models/CatalogProduct";
import type { Product } from "./database/Database";

function toDbProduct(p: CatalogProduct): Product {
    return {
        sku: p.sku,
        description: p.description,
        manufacturer: p.manufacturer,
        group_name: p.group,
        price: p.price,
        stock: p.stock,
    };
}

function logError(context: string, error: unknown): void {
    console.error(`❌ ${context}`);

    if (error instanceof Error) {
        console.error(`   Tipo: ${error.name}`);
        console.error(`   Mensagem: ${error.message}`);

        if (error.stack) {
            console.error(`   Stack: ${error.stack}`);
        }
    } else {
        console.error("   Erro:", error);
    }
}

async function closeAnnouncementPopup(page: Page): Promise<boolean> {
    const selectors = [
        "span.gx-popup-close",
        ".gx-popup-close",
        '[id$="_cls"].gx-popup-close',
    ];

    await page.waitForTimeout(800);

    for (let attempt = 1; attempt <= 3; attempt++) {
        for (const frame of page.frames()) {
            for (const selector of selectors) {
                try {
                    const btn = frame.locator(selector).first();

                    if (
                        (await btn.count()) > 0 &&
                        (await btn.isVisible())
                    ) {
                        await btn.click({ timeout: 3000 });

                        console.log(
                            `✅ Popup fechado: ${selector}`
                        );

                        await page.waitForTimeout(400);
                        return true;
                    }
                } catch {
                    // Tenta o próximo seletor ou frame.
                }
            }
        }

        await page.waitForTimeout(500);
    }

    console.log(
        "ℹ️ Nenhum popup detectado. Continuando a coleta."
    );

    return false;
}

/**
 * Grava uma página no Neon e registra o resultado.
 */
async function saveProducts(
    db: CatalogDatabase,
    products: CatalogProduct[],
    pageNumber: number
): Promise<{ inserted: number; updated: number }> {
    if (products.length === 0) {
        console.log(
            `ℹ️ [NEON] Página ${pageNumber}: nenhum produto para gravar.`
        );

        return { inserted: 0, updated: 0 };
    }

    const dbProducts = products.map(toDbProduct);
    const startedAt = Date.now();

    console.log("\n" + "-".repeat(60));
    console.log(`📝 [NEON] Iniciando gravação — página ${pageNumber}`);
    console.log(`📦 Produtos recebidos: ${products.length}`);
    console.log(`📦 Produtos enviados ao banco: ${dbProducts.length}`);
    console.log(`🕒 Início: ${new Date().toISOString()}`);
    console.log("🚀 [NEON] Executando upsert...");

    try {
        const result = await db.upsertProducts(dbProducts);

        console.log(
            `✅ [NEON] Página ${pageNumber} gravada com sucesso.`
        );
        console.log(`➕ Inseridos: ${result.inserted}`);
        console.log(`🔄 Atualizados: ${result.updated}`);
        console.log(
            `⏱️ Tempo de gravação: ${Date.now() - startedAt} ms`
        );
        console.log(`🕒 Fim: ${new Date().toISOString()}`);

        return result;
    } catch (error: unknown) {
        console.error(
            `🛑 [NEON] Falha na gravação da página ${pageNumber}.`
        );
        console.error(`📦 Quantidade enviada: ${dbProducts.length}`);
        console.error(
            `⏱️ Tempo até a falha: ${Date.now() - startedAt} ms`
        );

        logError("[NEON] Detalhes da falha no upsert", error);

        throw error;
    }
}

async function collectAllWithPlaywright(): Promise<void> {
    let browser:
        | Awaited<ReturnType<typeof chromium.launch>>
        | undefined;

    let db: CatalogDatabase | undefined;

    let totalColetados = 0;
    let totalInseridos = 0;
    let totalAtualizados = 0;
    let totalAntes: number | undefined;
    let pagina = 1;

    const startedAt = Date.now();

    console.log("\n" + "=".repeat(60));
    console.log("🚀 EXTRATOR DE CATÁLOGO — PIAGA MOTORS");
    console.log("=".repeat(60));
    console.log(`🕒 Início: ${new Date().toISOString()}`);
    console.log(`🖥️ Headless: ${env.HEADLESS}`);
    console.log(`🔐 URL do catálogo configurada: ${Boolean(env.CATALOGO_URL)}`);
    console.log(`🔐 E-mail configurado: ${Boolean(env.EMAIL)}`);
    console.log(`🔐 Senha configurada: ${Boolean(env.SENHA)}`);
    console.log(
        `🔐 DATABASE_URL configurada: ${Boolean(process.env.DATABASE_URL)}`
    );

    try {
        // ----------------------------------------------------
        // 1. Inicializa o navegador
        // ----------------------------------------------------

        console.log("\n🌐 Inicializando Playwright...");

        browser = await chromium.launch({
            headless: env.HEADLESS,
            slowMo: env.HEADLESS ? 0 : 100,
        });

        const context = await browser.newContext();
        const page = await context.newPage();

        // ----------------------------------------------------
        // 2. Login no catálogo
        // ----------------------------------------------------

        console.log("🌐 Abrindo catálogo...");

        await page.goto(env.CATALOGO_URL, {
            waitUntil: "domcontentloaded",
            timeout: 60000,
        });

        const frame = page.frameLocator(
            'iframe[title="Logincatalogo"]'
        );

        await frame
            .getByRole("textbox", {
                name: "Email",
                exact: true,
            })
            .fill(env.EMAIL);

        await frame
            .getByRole("textbox", {
                name: "Senha",
                exact: true,
            })
            .fill(env.SENHA);

        console.log("🔑 Credenciais preenchidas. Efetuando login...");

        const loginResponsePromise = page.waitForResponse(
            async (response) => {
                if (
                    !response.url().includes("Catalogo.aspx") ||
                    response.status() !== 200
                ) {
                    return false;
                }

                try {
                    const data = await response.json();

                    return (
                        Array.isArray(data.gxGrids) &&
                        data.gxGrids.length > 0
                    );
                } catch {
                    return false;
                }
            },
            { timeout: 30000 }
        );

        await frame
            .getByRole("button", { name: "Login" })
            .click();

        const loginResponse = await loginResponsePromise;
        const firstPageData = await loginResponse.json();

        console.log("✅ Login realizado.");
        console.log("✅ Primeira resposta do catálogo capturada.");

        await closeAnnouncementPopup(page);

        // ----------------------------------------------------
        // 3. Inicializa e testa o Neon
        // ----------------------------------------------------

        console.log("\n" + "=".repeat(60));
        console.log("🔌 DIAGNÓSTICO DE CONEXÃO — NEON");
        console.log("=".repeat(60));
        console.log(`🕒 Horário: ${new Date().toISOString()}`);
        console.log("🔎 Criando cliente do banco...");

        db = new CatalogDatabase();

        const connectionStartedAt = Date.now();

        console.log("📡 Testando conexão com SELECT 1...");

        try {
            await db.testConnection();

            console.log("✅ Conexão com o Neon validada.");
            console.log(
                `⏱️ Tempo do teste: ${
                    Date.now() - connectionStartedAt
                } ms`
            );
        } catch (error: unknown) {
            logError(
                "[NEON] Falha de conexão. Nenhuma atualização será iniciada.",
                error
            );

            throw error;
        }

        // ----------------------------------------------------
        // 4. Consulta quantidade de produtos antes da coleta
        // ----------------------------------------------------

        console.log("📊 Consultando quantidade inicial de produtos...");

        const countStartedAt = Date.now();

        totalAntes = await db.countProducts();

        console.log(`📊 Produtos no banco ANTES: ${totalAntes}`);
        console.log(
            `⏱️ Tempo da consulta: ${Date.now() - countStartedAt} ms`
        );

        // ----------------------------------------------------
        // 5. Processa a primeira página
        // ----------------------------------------------------

        const parser = new CatalogParser();
        const firstProducts = parser.parse(firstPageData);

        console.log(
            `📦 Produtos identificados na página 1: ${firstProducts.length}`
        );

        totalColetados += firstProducts.length;

        const firstResult = await saveProducts(
            db,
            firstProducts,
            pagina
        );

        totalInseridos += firstResult.inserted;
        totalAtualizados += firstResult.updated;

        // ----------------------------------------------------
        // 6. Paginação
        // ----------------------------------------------------

        while (true) {
            const nextButton = page
                .locator("li.next a")
                .first();

            if ((await nextButton.count()) === 0) {
                console.log(
                    "🏁 Botão de próxima página não encontrado. Fim da coleta."
                );
                break;
            }

            if (!(await nextButton.isVisible())) {
                console.log(
                    "🏁 Botão de próxima página não está visível."
                );
                break;
            }

            console.log(
                `\n🔎 Solicitando página ${pagina + 1}...`
            );

            const responsePromise = page.waitForResponse(
                async (response) => {
                    if (
                        !response.url().includes("Catalogo.aspx") ||
                        response.status() !== 200
                    ) {
                        return false;
                    }

                    try {
                        const data = await response.json();

                        return (
                            Array.isArray(data.gxGrids) &&
                            data.gxGrids.length > 0
                        );
                    } catch {
                        return false;
                    }
                },
                { timeout: 15000 }
            );

            await nextButton.click();

            const response = await responsePromise;
            const data = await response.json();
            const products = parser.parse(data);

            if (products.length === 0) {
                console.log(
                    "🏁 Página sem produtos. Fim da coleta."
                );
                break;
            }

            pagina++;
            totalColetados += products.length;

            const result = await saveProducts(
                db,
                products,
                pagina
            );

            totalInseridos += result.inserted;
            totalAtualizados += result.updated;

            await page.waitForTimeout(300);
        }

        // ----------------------------------------------------
        // 7. Confere resultado no banco
        // ----------------------------------------------------

        console.log("\n🔍 Verificando total final no Neon...");

        const finalCountStartedAt = Date.now();
        const totalFinal = await db.countProducts();

        console.log(
            `⏱️ Tempo da consulta final: ${
                Date.now() - finalCountStartedAt
            } ms`
        );

        console.log("\n" + "=".repeat(60));
        console.log("📊 RESUMO FINAL — PIAGA MOTORS");
        console.log("=".repeat(60));
        console.log(`📦 Produtos antes:       ${totalAntes}`);
        console.log(`📦 Produtos depois:      ${totalFinal}`);
        console.log(
            `📈 Variação líquida:     ${
                totalFinal - totalAntes
            }`
        );
        console.log(`🆕 Inseridos reportados: ${totalInseridos}`);
        console.log(`🔄 Atualizados reportados: ${totalAtualizados}`);
        console.log(`📥 Produtos coletados:   ${totalColetados}`);
        console.log(`📄 Páginas processadas:  ${pagina}`);
        console.log(
            `⏱️ Duração total:        ${
                ((Date.now() - startedAt) / 1000).toFixed(1)
            } segundos`
        );
        console.log(`🕒 Fim:                  ${new Date().toISOString()}`);
        console.log("=".repeat(60));
    } catch (error: unknown) {
        logError("[EXTRATOR] Execução interrompida.", error);
        throw error;
    } finally {
        // ----------------------------------------------------
        // 8. Encerra recursos mesmo em caso de falha
        // ----------------------------------------------------

        if (db) {
            try {
                await db.close();
                console.log("🔒 [NEON] Encerramento concluído.");
            } catch (error: unknown) {
                logError("[NEON] Erro ao encerrar recursos.", error);
            }
        }

        if (browser) {
            try {
                await browser.close();
                console.log("🔒 [PLAYWRIGHT] Navegador encerrado.");
            } catch (error: unknown) {
                logError(
                    "[PLAYWRIGHT] Erro ao encerrar navegador.",
                    error
                );
            }
        }
    }
}

collectAllWithPlaywright().catch((error: unknown) => {
    logError("[FATAL] O extrator terminou com erro.", error);
    process.exitCode = 1;
});