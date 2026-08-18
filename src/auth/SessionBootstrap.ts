import { Session } from "../models/Session";

export class SessionBootstrap {

    private static _instance = new SessionBootstrap();

    static get instance() {
        return this._instance;
    }

    private session: Session | null = null;

    set(session: Session) {
        this.session = session;
    }

    get() {
        if (!this.session)
            throw new Error("Sessão não inicializada.");

        return this.session;
    }

}