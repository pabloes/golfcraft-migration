import express from 'express';
import fs = require("fs");
import {promisify} from "util";
import {runChecks} from "./security/securityChecks";
import { issueGolfclub } from './golfclub-minter';
import cors from 'cors';
import { PlayFabServer } from 'playfab-sdk';
var bodyParser = require('body-parser');
import fetch from "cross-fetch";
import {logsHandler} from "../common/log-buffer";
import {redactError, redactedMessage} from "../common/redact";
import { discordHook } from '../common/discord-hooks'

const MINT_PRICE_DM = 120;
const app = express();

//before cors: the logs route never answers with CORS headers
app.get('*/_logs', logsHandler);
app.use(cors({ origin: true }));
app.use(express.json());

app.use('*/token/:tokenId', async (req, res)=>{
    return res.status(404).send();
    //TODO
    const indexedData = JSON.parse(await promisify(fs.readFile)('./indexed-data.json', 'utf8'));
    if(indexedData[req.params.tokenId]){
        return res.json(indexedData[req.params.tokenId]);
    }else{
        return res.status(404).send();
    }
});

export const VALID_PARCELS: number[][] = [ //TODO
    [47,-45],[47,-44],[47,-43],
    [48,-45],[48,-44],[48,-43],
    [49,-45],[49,-44],[49,-43]
];
const PUBLIC_GOLFCLUB_DISCORD_CHANNEL_URL = discordHook('DISCORD_HOOK_GOLFCLUB_PUBLIC');
const LOG_FILE_NAME = `golfclub-minter.log`;
const lastTimeUnlock = {};
app.post(`*/mint-golf-club`, async (req, res)=>{
    //return res.status(400).send({valid:false, error:"Temporally disabled"});
    try{

        if (await runChecks(req, VALID_PARCELS)) {

            const {PlayFabId, address, user} = req.body;
            if(lastTimeUnlock[PlayFabId] && ((lastTimeUnlock[PlayFabId]+2000) > Date.now())){
                console.log("don't spam please", PlayFabId, address);
                return res.status(500).json({error:"don't spam please"});
            }
            const authchain0 = await JSON.parse(req.header(`x-identity-auth-chain-0`));
            if(authchain0.payload.toLowerCase() !== address.toLowerCase()){
                console.log("payload", authchain0.payload.toLowerCase(), address.toLowerCase());
                fs.appendFile(LOG_FILE_NAME, `IMPERSONATION ${address.toLowerCase()} signed:${authchain0.payload.toLowerCase()} ${PlayFabId} ${JSON.stringify(req.body)}`, "utf8", ()=>{});
                return res.status(500).json({error:"Error x"});
            }
            if(!await checkAddressIsPlayFabId(address, PlayFabId)){
                fs.appendFile(LOG_FILE_NAME, `IMPERSONATION Not match PlayFabID ${address.toLowerCase()} signed:${authchain0.payload.toLowerCase()} ${PlayFabId}`, "utf8", ()=>{});
                return res.status(500).json({error:"Error x"});
            }
            lastTimeUnlock[PlayFabId] = Date.now();
            let receipt;
            try{
                const {data} = await promisify(PlayFabServer.GetUserInventory)({PlayFabId});
                if(!(data.VirtualCurrency?.DM >= MINT_PRICE_DM)){
                    return res.send({valid:false, error:"Not enough diamonds"});
                }
                receipt = await issueGolfclub(address, PlayFabId);
            }catch(error){
                //web3 errors carry the node URL (with its key): log and answer the redacted error only
                console.error(new Date().toISOString(), "failed to mint", redactError(error));
                callDiscordHook(`User ${user.displayName} failed to mint golf club `+redactedMessage(error));
                return res.status(400).send({valid:false, error:redactError(error)})
            }
            callDiscordHook(`User ${user.displayName} minted free golf club`, PUBLIC_GOLFCLUB_DISCORD_CHANNEL_URL);
            if(receipt){
                res.status(200).json({ valid: true, msg: 'Valid request' });
            }

        }else{
            console.log("Validation error");
            return res
          .status(500)
          .send({ valid: false, error: "Validation error, try from another Realm" })
        }
    }catch(err){
        console.log("error",redactError(err));
        return res
        .status(500)
        .send({ valid: false, error: "Error", details:redactError(err) })
    }

});
console.log("listening on PORT "+(process.env.PORT || "2567"))
app.listen(process.env.PORT || "2567")

async function callDiscordHook(str:any, url = discordHook('DISCORD_HOOK_DEFAULT')){
    //an unconfigured webhook (common/discord-hooks.ts) only logs
    if(!url) { console.log(str); return; }
  console.log(str);
  try{
      var body = typeof str === "string"?{
          username:"Bot",
          content: `${str}`
      }:str;

      return await fetch(url,
          {
              method:"POST",
              body:JSON.stringify(body),
              headers:{'Content-Type':"application/json"}
          })
  }catch(error){
      console.log("error calling discord hook", str, redactedMessage(error));
  }

}

async function checkAddressIsPlayFabId(address, PlayFabId){
    const Data = await promisify(PlayFabServer.GetPlayFabIDsFromGenericIDs)({
        "GenericIDs": [
            {
                "ServiceName": "address",
                "UserId": address.toLowerCase()
            }
        ]
    }).then(r=>r.data.Data);

    if(Data[0].PlayFabId !== PlayFabId){
        console.error("FT: Impersonation?", Data[0].PlayFabId, PlayFabId, address,);
       return false;
    }

    return true;
}