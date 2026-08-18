import { SessionBootstrap } from "../auth/SessionBootstrap";
import { CatalogClient } from "./CatalogClient";
import { PayloadBuilder } from "./PayloadBuilder";

class CatalogParser {
    parse(response: unknown): unknown {
        return response;
    }
}

export class CatalogService {

    private readonly client = new CatalogClient();

    private readonly parser = new CatalogParser();

    async searchSku(sku: string) {

        const session = SessionBootstrap.instance.get();

        const builder = new PayloadBuilder(
            session.payloadTemplate
        );

        const payload = builder.searchSku(sku);

        console.log("==================================");
        console.log("BUSCANDO SKU");
        console.log(sku);
        console.log("==================================");

        const response = await this.client.search(payload);

        return this.parser.parse(response);

    }

    async searchDescription(description: string) {

        const session = SessionBootstrap.instance.get();

        const builder = new PayloadBuilder(
            session.payloadTemplate
        );

        const payload = builder.searchDescription(description);

        const response = await this.client.search(payload);

        return this.parser.parse(response);

    }

    async searchManufacturer(manufacturer: string) {

        const session = SessionBootstrap.instance.get();

        const builder = new PayloadBuilder(
            session.payloadTemplate
        );

        const payload = builder.searchManufacturer(manufacturer);

        const response = await this.client.search(payload);

        return this.parser.parse(response);

    }

    async searchGroup(group: string) {

        const session = SessionBootstrap.instance.get();

        const builder = new PayloadBuilder(
            session.payloadTemplate
        );

        const payload = builder.searchGroup(group);

        const response = await this.client.search(payload);

        return this.parser.parse(response);

    }

}