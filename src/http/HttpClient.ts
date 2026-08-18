import axios from "axios";
import { Session } from "../models/Session";
import { env } from "../config/env";

export class HttpClient {

    create(session: Session) {

        return axios.create({

            baseURL: env.CATALOGO_URL,

            headers: {

                Cookie: session.cookies,

                ajax_security_token: session.ajaxSecurityToken,

                "x-gxauth-token": session.gxAuthToken

            }

        });

    }

}