import { LoginService } from "./auth/LoginService";
import { PayloadBuilder } from "./catalog/PayloadBuilder";
import { CatalogClient } from "./catalog/CatalogClient";
import { CatalogParser } from "./catalog/CatalogParser";
import { SessionManager } from "./auth/SessionManager";

async function main() {



    const sessionManager = new SessionManager();

    const session = await sessionManager.getSession();

    console.log("Sessão criada.");

    const payload = new PayloadBuilder(
        session.payloadTemplate
    ).searchSku("HF87");

    const client = new CatalogClient();

    const response = await client.search(session, payload);

    if (!response?.gxGrids) {

        console.error("Resposta inválida.");

        console.dir(response, { depth: null });

        return;
    }

    const parser = new CatalogParser();

    const products = parser.parse(response);

    console.table(products);

}

main().catch(console.error);