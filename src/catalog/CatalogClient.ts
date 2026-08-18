import axios from "axios";

import { env } from "../config/env";
import { Session } from "../models/Session";

export class CatalogClient {

    async search(
        session: Session,
        payload: unknown
    ) {

        const response = await axios.post(
            env.CATALOGO_URL,
            payload,
            {
                headers: {
                    Cookie: session.cookies,
                    gxajaxrequest: "1",
                    ajax_security_token: session.ajaxSecurityToken,
                    "x-gxauth-token": session.gxAuthToken,
                    "Content-Type": "application/json"
                }
            }
        );

        return response.data;

    }

    async ping(session: Session): Promise<void> {

        const payload = session.payloadTemplate;

        await this.search(session, payload);

    }

}