import fetch from "cross-fetch";
import {redactedMessage} from "./redact";

export function callDiscordHook(str:string, url = "https://discord.com/api/webhooks/REDACTED" ){
    console.log(str);
    try{
        var body = {
            username:"Caddie",
            content: `${str}`
        };

        //callers don't await it: a failure must not become an unhandled
        //rejection, and the error is logged without the URL (it holds the token)
        return fetch(url,
            {
                method:"POST",
                body:JSON.stringify(body),
                headers:{'Content-Type':"application/json"}
            }).catch((error)=>{
                console.log("discord hook error", redactedMessage(error));
            })
    }catch(error){
        console.log("discord hook error", redactedMessage(error))
    }
}
