// What a backend may print or store about an error or a request. Shared by the
// web API, the game server and the golfclub minter.
//
// Errors from node-fetch / cross-fetch and web3 carry the full URL in their
// message ("request to https://discord.com/api/webhooks/<id>/<token> failed",
// "Couldn't connect to node https://<host>/<key>"), and those URLs hold webhook
// tokens and API keys. Join options carry the PlayFab session ticket, which is
// a login. Print errors through redactError / redactedMessage and options
// through withoutSecrets, never the raw objects.

const URL_PATTERN = /\b(?:https?|wss?):\/\/[^\s"'`<>()\[\]{},]+/gi;
const ERROR_FIELDS = ["name", "code", "type", "errno", "reason", "status", "statusCode", "errorCode", "errorMessage"];
const SECRET_KEYS = ["sessionticket", "apikey", "signature", "privatekey", "password", "secret", "token"];

//every URL in the text reduced to its origin (no path, query or credentials)
export function redactUrls(text: any): string {
    return String(text ?? "").replace(URL_PATTERN, (url) => {
        try{
            return new URL(url).origin;
        }catch(error){
            return "<url>";
        }
    });
}

//the fields of an error worth logging, with every URL reduced to its origin
export function redactError(error: any, depth = 0): any {
    if(error === null || error === undefined) return error;
    if(typeof error !== "object") return redactUrls(error);
    const out: any = {};
    for(const key of ERROR_FIELDS){
        const value = error[key];
        if(value === undefined || value === null || typeof value === "object" || typeof value === "function") continue;
        out[key] = typeof value === "string" ? redactUrls(value) : value;
    }
    if(error.message !== undefined) out.message = redactUrls(error.message);
    //wrappers such as {type, error} (golfclub-minter) and PlayFab's {error, errorMessage}
    if(error.error !== undefined && depth < 3) out.error = redactError(error.error, depth + 1);
    return out;
}

//one line for string contexts (template literals, Discord messages)
export function redactedMessage(error: any): string {
    if(error === null || error === undefined || typeof error !== "object") return redactUrls(error);
    const {name, code, type, message} = redactError(error);
    const nested = error.error && typeof error.error === "object" ? redactedMessage(error.error) : redactUrls(error.error ?? "");
    return [name, code || type, message ?? nested].filter(part => part !== undefined && part !== "").join(" ");
}

//a copy of join options / clientInfo / a request body without credentials
//(sessionTicket, apiKey, signature, ...), safe to log or to store
export function withoutSecrets(value: any, depth = 0): any {
    if(value === null || typeof value !== "object" || depth > 5) return value;
    if(Array.isArray(value)) return value.map(item => withoutSecrets(item, depth + 1));
    const out: any = {};
    for(const key of Object.keys(value)){
        if(SECRET_KEYS.includes(key.toLowerCase())) continue;
        out[key] = withoutSecrets(value[key], depth + 1);
    }
    return out;
}
