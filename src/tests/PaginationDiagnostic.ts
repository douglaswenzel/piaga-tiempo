import { SessionManager } from "../auth/SessionManager";
import { CatalogClient } from "../catalog/CatalogClient";
import { PayloadBuilder } from "../catalog/PayloadBuilder";
import { CatalogParser } from "../catalog/CatalogParser";

interface PaginationTest {
    name: string;
    parms: Record<number, unknown>;
}

interface PaginationResult {
    name: string;
    requested: number;
    returned: number;
    firstSku: string | null;
    lastSku: string | null;
    raw: unknown;
}

export class PaginationDiagnostic {

    private readonly sessionManager: SessionManager;
    private readonly catalogClient: CatalogClient;
    private readonly catalogParser: CatalogParser;

    constructor() {

        this.sessionManager = new SessionManager();
        this.catalogClient = new CatalogClient();
        this.catalogParser = new CatalogParser();

    }

    async run(): Promise<void> {

        console.log("");
        console.log("==================================");
        console.log(" PIAGA TIEMPO - DIAGNÓSTICO PAGINAÇÃO");
        console.log("==================================");

        const session = await this.sessionManager.getSession();

        const builder = new PayloadBuilder(
            session.payloadTemplate
        );

        const tests: PaginationTest[] = [
            {
                name: "BASE - 10 PRODUTOS",
                parms: {
                    1: 0,
                    2: 10
                }
            },
            {
                name: "TESTE - 20 PRODUTOS",
                parms: {
                    1: 0,
                    2: 20
                }
            },
            {
                name: "TESTE - 50 PRODUTOS",
                parms: {
                    1: 0,
                    2: 50
                }
            },
            {
                name: "POSSÍVEL OFFSET 10 - 10 PRODUTOS",
                parms: {
                    1: 10,
                    2: 10
                }
            },
            {
                name: "POSSÍVEL OFFSET 20 - 10 PRODUTOS",
                parms: {
                    1: 20,
                    2: 10
                }
            }
        ];

        const results: PaginationResult[] = [];

        for (const test of tests) {

            console.log("");
            console.log("----------------------------------");
            console.log(test.name);
            console.log("----------------------------------");

            const payload = builder.build();

            for (const [index, value] of Object.entries(test.parms)) {

                payload.parms[Number(index)] = value;

            }

            console.log("parms utilizados:");
            console.dir(payload.parms, {
                depth: 4
            });

            try {

                const response = await this.catalogClient.search(
                    session,
                    payload
                );

                console.log("");
                console.log("ESTRUTURA DA RESPOSTA:");
                console.log(
                    response?.gxGrids
                        ? "gxGrids encontrado."
                        : "gxGrids NÃO encontrado."
                );

                if (!response?.gxGrids) {

                    console.error(
                        "Resposta não possui gxGrids."
                    );

                    console.dir(response, {
                        depth: 10
                    });

                    continue;
                }

                const products = this.catalogParser.parse(
                    response
                );

                const result: PaginationResult = {
                    name: test.name,
                    requested: Number(test.parms[2]),
                    returned: products.length,
                    firstSku: products[0]?.sku ?? null,
                    lastSku: products[products.length - 1]?.sku ?? null,
                    raw: response
                };

                results.push(result);

                console.log("");
                console.log("Resultado:");
                console.log(`Solicitados : ${result.requested}`);
                console.log(`Recebidos   : ${result.returned}`);
                console.log(`Primeiro SKU: ${result.firstSku}`);
                console.log(`Último SKU  : ${result.lastSku}`);
                console.log("");
                console.log("Produtos recebidos:");

                console.table(products);

            } catch (error) {

                console.error("");
                console.error("Erro durante o teste:");
                console.error(error);

            }

        }

        this.printSummary(results);

    }


    private printSummary(
        results: PaginationResult[]
    ): void {

        console.log("");
        console.log("==================================");
        console.log(" RESUMO DOS TESTES");
        console.log("==================================");

        console.table(
            results.map(result => ({
                teste: result.name,
                solicitados: result.requested,
                recebidos: result.returned,
                primeiro: result.firstSku,
                ultimo: result.lastSku
            }))
        );

        console.log("");
        console.log("Diagnóstico concluído.");
        console.log("");

    }

}