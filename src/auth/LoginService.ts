import { chromium, Request } from "playwright";
import { env } from "../config/env";
import { Session } from "../models/Session";

export class LoginService {

    async login(): Promise<Session> {
        console.log("==================================");
        console.log(" PIAGA TIEMPO ");
        console.log("==================================");

        const browser = await chromium.launch({ headless: false, slowMo: 200 });
        const context = await browser.newContext();
        const page = await context.newPage();

        console.log("Abrindo catálogo...");
        await page.goto(env.CATALOGO_URL, { waitUntil: "networkidle" });
        console.log("Página carregada.");

        const frame = page.frameLocator('iframe[title="Logincatalogo"]');
        await frame.locator('input[type="text"], input[type="email"]').first().waitFor({ timeout: 15000 });

        console.log("Preenchendo login...");
        await frame.getByRole("textbox", { name: "Email", exact: true }).fill(env.EMAIL);
        await frame.getByRole("textbox", { name: "Senha", exact: true }).fill(env.SENHA);

        const capturedRequests: Request[] = [];
        const requestListener = (request: Request) => {
            if (request.method() === "POST" && request.url().includes("Catalogo.aspx")) {
                capturedRequests.push(request);
            }
        };
        page.on("request", requestListener);

        console.log("Efetuando login...");
        await frame.getByRole("button", { name: "Login" }).click();

        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(3000);

        page.off("request", requestListener);

        console.log("Login realizado.");

        let gxEvent = "";
        let payloadTemplate: any = null;
        let headers: Record<string, string> = {};

        for (let i = capturedRequests.length - 1; i >= 0; i--) {
            const url = capturedRequests[i].url();
            const match = url.match(/\?([a-f0-9]+),gx-no-cache/i);
            if (match) {
                gxEvent = match[1];
                payloadTemplate = capturedRequests[i].postDataJSON();
                headers = capturedRequests[i].headers() as Record<string, string>;
                break;
            }
        }

        if (!gxEvent) {
            gxEvent = await this.extractGxEventFromHtml(page);
        }

        if (!gxEvent || !payloadTemplate) {
            console.log("❌ Requisições capturadas:", capturedRequests.length);
            if (capturedRequests.length > 0) {
                console.log("   URL da última requisição:", capturedRequests[capturedRequests.length - 1].url());
            }
            await browser.close();
            throw new Error("Não foi possível capturar o GXEvent ou o payload. Verifique o console.");
        }

        const cookies = await context.cookies();
        const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");

        const ajaxSecurityToken = headers["ajax_security_token"] || headers["ajax-security-token"] || "";
        const gxAuthToken = headers["x-gxauth-token"] || "";

        console.log("==================================");
        console.log("HEADERS (login)");
        console.dir(headers, { depth: null });
        console.log("==================================");
        console.log("COOKIES");
        console.log(cookieHeader);
        console.log("==================================");
        console.log("PAYLOAD TEMPLATE (JSON original)");
        console.dir(payloadTemplate, { depth: null });
        console.log("==================================");
        console.log("TOKENS");
        console.log("ajax_security_token:", ajaxSecurityToken);
        console.log("gxAuthToken:", gxAuthToken);
        console.log("GXEvent (da URL):", gxEvent);
        console.log("==================================");

        await browser.close();

        return {
            cookies: cookieHeader,
            ajaxSecurityToken,
            gxAuthToken,
            headers,
            payloadTemplate,
            gxEvent
        };
    }

    private async extractGxEventFromHtml(page: any): Promise<string> {
        const html = await page.content();
        const patterns = [
            /<input[^>]+name=["']GXEvent["'][^>]+value=["']([^"']*)["']/i,
            /<input[^>]+name=["']([^"']*gxevent[^"']*)["'][^>]+value=["']([^"']*)["']/i,
            /GXEvent\s*[:=]\s*["']([^"']+)["']/i,
        ];
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) return match[1] || match[2] || '';
        }
        return '';
    }
}