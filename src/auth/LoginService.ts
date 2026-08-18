import { chromium } from "playwright";
import { env } from "../config/env";
import { Session } from "../models/Session";

export class LoginService {

    async login(): Promise<Session> {

        console.log("==================================");
        console.log(" PIAGA TIEMPO ");
        console.log("==================================");

        const browser = await chromium.launch({
            headless: false,
            slowMo: 200
        });

        const context = await browser.newContext();

        const page = await context.newPage();

        console.log("Abrindo catálogo...");

        await page.goto(env.CATALOGO_URL, {
            waitUntil: "networkidle"
        });

        console.log("Página carregada.");

        const frame = page.frameLocator(
            'iframe[title="Logincatalogo"]'
        );

        console.log("Preenchendo login...");

        await frame
            .getByRole("textbox", {
                name: "Email",
                exact: true
            })
            .fill(env.EMAIL);

        await frame
            .getByRole("textbox", {
                name: "Senha",
                exact: true
            })
            .fill(env.SENHA);

        // Primeira requisição AJAX do GeneXus
        const requestPromise = page.waitForRequest(req =>
            req.method() === "POST" &&
            req.url().includes("Catalogo.aspx")
        );

        console.log("Efetuando login...");

        await frame
            .getByRole("button", {
                name: "Login"
            })
            .click();

        const request = await requestPromise;

        console.log("Login realizado.");

        await page.waitForLoadState("networkidle");

        // Aguarda todas as chamadas AJAX terminarem
        await page.waitForTimeout(3000);

        const cookies = await context.cookies();

        const cookieHeader = cookies
            .map(cookie => `${cookie.name}=${cookie.value}`)
            .join("; ");

        const headers = request.headers();

        const ajaxSecurityToken =
            headers["ajax_security_token"] ??
            headers["ajax-security-token"] ??
            "";

        const gxAuthToken =
            headers["x-gxauth-token"] ??
            "";

        const payloadTemplate =
            request.postDataJSON();

        console.log("==================================");
        console.log("HEADERS");
        console.dir(headers, {
            depth: null
        });

        console.log("==================================");
        console.log("COOKIES");
        console.log(cookieHeader);

        console.log("==================================");
        console.log("PAYLOAD TEMPLATE");
        console.dir(payloadTemplate, {
            depth: null
        });

        console.log("==================================");
        console.log("TOKENS");

        console.log(
            "ajax_security_token:",
            ajaxSecurityToken
        );

        console.log(
            "gxAuthToken:",
            gxAuthToken
        );

        console.log("==================================");

        await browser.close();

        return {

            cookies: cookieHeader,

            ajaxSecurityToken,

            gxAuthToken,

            headers,

            payloadTemplate

        };

    }

}