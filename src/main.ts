import { SessionManager } from "./auth/SessionManager";
import { CatalogPaginator } from "./catalog/CatalogPaginator";
import { PaginationDiagnostic } from "./tests/PaginationDiagnostic";

async function main() {

    const runPaginationDiagnostic = true;

    if (runPaginationDiagnostic) {
        const diagnostic = new PaginationDiagnostic();
        await diagnostic.run();
        return;
    }

    const sessionManager = new SessionManager();
    const session = await sessionManager.getSession();
    console.log("Sessão criada.");


    const paginator = new CatalogPaginator();
    const result = await paginator.fetchPage(session, 2, {
        pageSize: 10,
        searchTerm: "PISTAO",
        delayBetweenPages: 500
    });

    console.log(`📄 Página ${result.currentPage} de ${result.totalPages}`);
    console.table(result.products);
}

main().catch(console.error);