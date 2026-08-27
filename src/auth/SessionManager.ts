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

        newSession.payloadTemplate = this.ensureSearchPayload(newSession.payloadTemplate);

        await this.save(newSession);
        return newSession;
    }

    private ensureSearchPayload(payload: any): any {
        if (payload.parms && payload.parms[1] && payload.parms[1] !== "0" && payload.parms[1] !== "") {
            console.log("✅ Payload já possui busca ativa.");
            return payload;
        }

        console.log("🔧 Adicionando busca ativa ao payload...");

        const newPayload = JSON.parse(JSON.stringify(payload));

        if (!newPayload.parms) {
            newPayload.parms = [];
        }

        newPayload.parms[1] = "PISTAO";

        if (!newPayload.parms[2] || newPayload.parms[2] === 0) {
            newPayload.parms[2] = 50;
        }

        if (!newPayload.gxValues) {
            newPayload.gxValues = [{}];
        } else if (!Array.isArray(newPayload.gxValues)) {
            newPayload.gxValues = [newPayload.gxValues];
        }

        if (!newPayload.gxValues[0]) {
            newPayload.gxValues[0] = {};
        }

        newPayload.gxValues[0].AV15GridCurrentPage = "1";

        console.log("✅ Busca ativa adicionada ao payload!");
        console.log(`   Termo: "${newPayload.parms[1]}"`);
        console.log(`   Página: ${newPayload.gxValues[0].AV15GridCurrentPage}`);

        return newPayload;
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
            const json = await fs.readFile(this.file, "utf8");
            const session = JSON.parse(json);

            if (session.payloadTemplate) {
                session.payloadTemplate = this.ensureSearchPayload(session.payloadTemplate);
            }

            return session;
        } catch {
            return null;
        }
    }

    private async save(session: Session): Promise<void> {
        await fs.mkdir(path.dirname(this.file), { recursive: true });

        const sessionToSave = {
            ...session,
            payloadTemplate: this.ensureSearchPayload(session.payloadTemplate)
        };

        await fs.writeFile(
            this.file,
            JSON.stringify(sessionToSave, null, 4),
            "utf8"
        );

        console.log("✅ Sessão salva com payload corrigido.");
    }

    async updatePayload(searchTerm: string = "PISTAO", pageSize: number = 50): Promise<void> {
        const session = await this.load();
        if (!session) {
            console.log("⚠️ Nenhuma sessão encontrada para atualizar.");
            return;
        }

        const newPayload = this.ensureSearchPayload(session.payloadTemplate);
        newPayload.parms[1] = searchTerm;
        newPayload.parms[2] = pageSize;

        session.payloadTemplate = newPayload;
        await this.save(session);

        console.log(`✅ Payload atualizado com termo: "${searchTerm}"`);
    }

    async inspectPayload(): Promise<void> {
        const session = await this.load();
        if (!session) {
            console.log("⚠️ Nenhuma sessão encontrada.");
            return;
        }

        console.log("\n📋 PAYLOAD ATUAL:");
        console.log("=".repeat(60));
        console.log(`  Termo de busca (parms[1]): ${session.payloadTemplate?.parms?.[1] || 'NÃO DEFINIDO'}`);
        console.log(`  Tamanho da página (parms[2]): ${session.payloadTemplate?.parms?.[2] || 'NÃO DEFINIDO'}`);
        console.log(`  gxValues: ${session.payloadTemplate?.gxValues ? '✅ Existe' : '❌ Não existe'}`);
        console.log(`  AV15GridCurrentPage: ${session.payloadTemplate?.gxValues?.[0]?.AV15GridCurrentPage || 'NÃO DEFINIDO'}`);
        console.log("=".repeat(60));
    }
}