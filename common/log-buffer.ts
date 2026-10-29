import {timingSafeEqual} from "crypto";

// The last MAX_LINES lines a backend printed, so they can be read over HTTP
// (scripts/backend-logs.sh) without the CapRover dashboard. Importing this
// module starts the capture, so import it FIRST in a service's entry file.
// A copy lives in ~/dev/ohmyverse/onchain-queue/src/log-buffer.ts (the bridge
// is another repo): keep both the same.
//
// The route is off unless the app has LOGS_TOKEN; the token travels in the
// Authorization header, never in the URL. Logs can hold wallets, PlayFabIds
// and IPs: never make the route public.
const MAX_LINES = 5000;
const lines: string[] = [];
const partial = {out: "", err: ""};

function push(stream: "out" | "err", text: string){
    const parts = (partial[stream] + text).split("\n");
    partial[stream] = parts.pop() || "";
    const at = new Date().toISOString();
    for(const line of parts) lines.push(`${at} ${stream === "err" ? "[err] " : ""}${line}`);
    if(lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
}

for(const [stream, target] of [["out", process.stdout], ["err", process.stderr]] as const){
    const write = target.write.bind(target);
    target.write = ((chunk: any, ...args: any[]) => {
        try{
            push(stream, typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
        }catch(error){
            //capturing must never break the real write
        }
        return write(chunk, ...args);
    }) as typeof target.write;
}

//GET ?lines=300&grep=text  (Authorization: Bearer <LOGS_TOKEN>)
export function logsHandler(req, res){
    const token = process.env.LOGS_TOKEN;
    if(!token) return res.status(404).send("Not found");
    const given = Buffer.from(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
    const expected = Buffer.from(token);
    if(given.length !== expected.length || !timingSafeEqual(given, expected)){
        return res.status(401).send("Unauthorized");
    }
    const count = Math.min(MAX_LINES, Math.max(1, Number(req.query.lines) || 300));
    const grep = String(req.query.grep || "").toLowerCase();
    const selected = grep ? lines.filter(line => line.toLowerCase().includes(grep)) : lines;
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    return res.type("text/plain").send(selected.slice(-count).join("\n") + "\n");
}
