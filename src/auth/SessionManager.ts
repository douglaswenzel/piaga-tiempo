import fs from "fs/promises";
import path from "path";

import { LoginService } from "./LoginService";
import { CatalogClient } from "../catalog/CatalogClient";
import { Session } from "../models/Session";

export class SessionManager {

    private readonly file = path.resolve(
        process.cwd(),
        "storage",
        "session.json"
    );

    private readonly loginService = new LoginService();

    private readonly catalogClient = new CatalogClient();

    async getSession(): Promise<Session> {

        const session = await this.load();

        if (session) {

            console.log("Sessão encontrada.");

            const valid = await this.validate(session);

            if (valid) {

                console.log("Sessão reutilizada.");

                return session;

            }

            console.log("Sessão expirada.");

        }

        console.log("Realizando novo login...");

        const newSession = await this.loginService.login();

        await this.save(newSession);

        return newSession;

    }

    private async validate(session: Session): Promise<boolean> {

        try {

            await this.catalogClient.ping(session);

            return true;

        } catch {

            return false;

        }

    }

    private async load(): Promise<Session | null> {

        try {

            const json = await fs.readFile(
                this.file,
                "utf8"
            );

            return JSON.parse(json);

        } catch {

            return null;

        }

    }

    private async save(session: Session): Promise<void> {

        await fs.mkdir(
            path.dirname(this.file),
            {
                recursive: true
            }
        );

        await fs.writeFile(
            this.file,
            JSON.stringify(session, null, 4),
            "utf8"
        );

    }

}