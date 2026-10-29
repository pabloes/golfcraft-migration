// What the public generic read routes may touch:
//   POST /api/prisma-find-many/:table, POST /api/prisma-find-first/:table (index.ts)
//   POST /api/get-random-row {table, query} (seasons.ts)
// They used to pass any table and any Prisma arguments straight through, which
// let anyone read admin_users, config (the game-window allow-list),
// chain_queuer_actions, random_rewards... Now a table must be listed here, the
// `where` may only filter on that table's listed columns, and only those
// columns come back. Anything else answers 403.
//
// Each entry names the callers it serves; add a column only for a caller that
// reads it. There are no relations in schema.prisma, so `include` is never
// needed and always refused.
type ReadRule = {
    columns: string[],//returned (the `select`)
    filters: string[],//allowed in `where`
};

const COURSE_COLUMNS = ["ID", "alias", "displayName", "createdBy", "tokenId", "evaluation", "timesPlayed",
    "averageTime", "rewards", "isSeason", "minTierCat", "maxTierCat"];
const CHEST_EVENT_COLUMNS = ["ID", "startDate", "endDate", "specialPrizeMessage", "inTournament", "inSeason",
    "chestRewardChances", "bannerLinkURL", "bannerImageURL"];

const PRISMA_READ_RULES: {[table: string]: ReadRule} = {
    //web/client MyCourses + BuilderContest (source and the deployed dist bundle):
    //  where {NOT:[{tokenId:null},{tokenId:0}], createdBy?}, reads ID, alias,
    //  displayName, createdBy, evaluation, timesPlayed, averageTime, rewards.
    //web/server/db-script/delete-recorded-games.ts: where {isSeason, minTierCat}, reads alias.
    courses: {columns: COURSE_COLUMNS, filters: COURSE_COLUMNS},
    //server/rooms/Season-Room.ts + Tournament-Room.ts: where {startDate:{lte}, endDate:{gte}},
    //reads inSeason / inTournament / chestRewardChances (chests-generator.ts).
    chest_events: {columns: CHEST_EVENT_COLUMNS, filters: CHEST_EVENT_COLUMNS},
    //old SDK6 scene, connectPlayfab.getAffiliateCode: where {PlayFabId}, reads affiliateID
    affiliate_player: {columns: ["affiliateID"], filters: ["PlayFabId"]},
    //old SDK6 scene, connectPlayfab.getAffiliateCode: where {ID}, reads code
    affiliates: {columns: ["code"], filters: ["ID"]},
};

//get-random-row returns whole rows (the Season rooms and CreateTournament use
//the full course); every caller asks for `courses`
const RANDOM_ROW_TABLES = ["courses"];

function isAllowedWhere(where: any, filters: string[], depth = 0): boolean {
    if(where === undefined) return true;
    if(where === null || typeof where !== "object" || Array.isArray(where) || depth > 5) return false;
    return Object.keys(where).every((key) => {
        if(key === "AND" || key === "OR" || key === "NOT"){
            const list = Array.isArray(where[key]) ? where[key] : [where[key]];
            return list.every(item => isAllowedWhere(item, filters, depth + 1));
        }
        //a listed scalar column: a value or a scalar filter ({lte}, {not}, {in}...)
        return filters.includes(key);
    });
}

//the Prisma arguments to run for a find-many / find-first request, or null (403)
export function getAllowedFindArgs(table: string, body: any): any {
    const rule = Object.prototype.hasOwnProperty.call(PRISMA_READ_RULES, table) && PRISMA_READ_RULES[table];
    if(!rule) return null;
    const args = body && typeof body === "object" ? body : {};
    if(Object.keys(args).some(key => key !== "where" && key !== "select")) return null;
    if(!isAllowedWhere(args.where, rule.filters)) return null;
    let columns = rule.columns;
    if(args.select !== undefined){
        if(!args.select || typeof args.select !== "object" || Array.isArray(args.select)) return null;
        const requested = Object.keys(args.select);
        if(requested.some(key => !rule.columns.includes(key) || typeof args.select[key] !== "boolean")) return null;
        columns = requested.filter(key => args.select[key]);
        if(!columns.length) return null;
    }
    const select = columns.reduce((acc, column) => (acc[column] = true, acc), {});
    return args.where === undefined ? {select} : {where: args.where, select};
}

//whether a get-random-row request may run as sent
export function isAllowedRandomRowQuery(table: string, query: any): boolean {
    if(!RANDOM_ROW_TABLES.includes(table)) return false;
    if(query === undefined) return true;
    if(!query || typeof query !== "object" || Array.isArray(query)) return false;
    if(Object.keys(query).some(key => key !== "where")) return false;
    return isAllowedWhere(query.where, PRISMA_READ_RULES[table].filters);
}
