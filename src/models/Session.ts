export interface Session {

    cookies: string;

    ajaxSecurityToken: string;

    gxAuthToken: string;

    headers: Record<string, string>;

    payloadTemplate: any;

}