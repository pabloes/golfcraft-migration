import fetch from "cross-fetch";

export function callDiscordHook(str:string, url = "https://discord.com/api/webhooks/REDACTED" ){
    console.log(str);
    try{
        var body = {
            username:"Caddie",
            content: `${str}`
        };

        return fetch(url,
            {
                method:"POST",
                body:JSON.stringify(body),
                headers:{'Content-Type':"application/json"}
            })
    }catch(error){
        console.log("discord hook error", error)
    }
}