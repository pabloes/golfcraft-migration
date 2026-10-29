const avatars:any = {};
const storageAvatars = localStorage.getItem("avatars");
if(storageAvatars){
    Object.assign(avatars, JSON.parse(storageAvatars));
}
export const getAvatars = ()=>avatars;

//Decentraland's lambdas only take POST /profiles now (GET ?id= answers 405), so
//the lookup is one batched request. Plain fetch, not resolveFetch: that helper
//sends the browser home on a 400. A failed lookup only leaves avatars out.
export const fetchAvatars = async (addresses:string[], store:any = avatars) => {
    const missing = addresses.filter(address => address && !store[address]);
    if(!missing.length) return store;
    try{
        const profiles:any[] = await fetch("https://peer-lb.decentraland.org/lambdas/profiles", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ids:missing})
        }).then(r => r.ok ? r.json() : []);
        const byAddress = {};
        profiles.forEach(profile => {
            const avatar = profile?.avatars?.[0];
            if(avatar?.ethAddress) byAddress[avatar.ethAddress.toLowerCase()] = avatar;
        });
        missing.forEach(address => {
            if(byAddress[address.toLowerCase()]) store[address] = byAddress[address.toLowerCase()];
        });
    }catch(error){
        console.log("fetchAvatars error", error);
    }
    return store;
}