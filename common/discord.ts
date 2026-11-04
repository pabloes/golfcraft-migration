import fetch from "cross-fetch";
import {redactedMessage} from "./redact";
import { discordHook } from './discord-hooks'

export function callDiscordHook(str:string, url = discordHook('DISCORD_HOOK_DEFAULT') ){
    console.log(str);
    //an unconfigured webhook (common/discord-hooks.ts) only logs
    if(!url) return;
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
