// Finds (and, with --delete, removes) PlayFab accounts that have no wallet
// behind them: the empty accounts the SDK7 scene created before its login ran
// `initializePlayer` (CLAUDE.md §6 #24), plus local-dev test logins.
//
// An account counts as an orphan only when ALL of these hold:
//   - created on or after --since (default 2026-05-01, the migration's start)
//   - ReadOnlyData.initialized is unset  (initializePlayer never ran; every
//     SDK6 login ran it, so real players always have it)
//   - UserData.address is unset          (SDK6 wrote it right after login)
//   - no golfclub-1 in the inventory     (initializePlayer grants it)
// Accounts that do have UserData.address are also checked for the "address"
// generic-ID link and reported, but never deleted.
//
// Player listing: PlayFab retired GetPlayersInSegment (404), so this runs an
// "All Players" segment export (Admin/ExportPlayersInSegment + GetSegmentExport)
// and downloads its TSV parts; --export-dir <dir> reuses parts already
// downloaded. Only the profile list comes from the export; the verdict for
// each candidate comes from a live GetPlayerCombinedInfo.
//
// Dry run by default: prints every candidate with its verdict and writes a
// JSON report. Nothing is deleted unless --delete is passed. Admin/DeletePlayer
// is permanent (the Server variant is off in this title's API Features). Credentials come from web/.env like reset-mission.js.
//
//   node scripts/playfab-delete-orphan-accounts.js [--since YYYY-MM-DD] [--export-dir DIR] [--delete]
const fs = require('fs');
const path = require('path');
const https = require('https');

const webDir = path.join(__dirname, '..', 'web');
const env = fs.readFileSync(path.join(webDir, '.env'), 'utf8');
const get = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').replace(/^"|"$/g, '');
const PlayFab = require(path.join(webDir, 'node_modules/playfab-sdk/Scripts/PlayFab/PlayFab'));
const PlayFabServer = require(path.join(webDir, 'node_modules/playfab-sdk/Scripts/PlayFab/PlayFabServer'));
const PlayFabAdmin = require(path.join(webDir, 'node_modules/playfab-sdk/Scripts/PlayFab/PlayFabAdmin'));
PlayFab.settings.titleId = get('PLAYFAB_TITLE_ID');
PlayFab.settings.developerSecretKey = get('PLAYFAB_SECRET_KEY');
if (!PlayFab.settings.titleId || !PlayFab.settings.developerSecretKey) {
  console.error('missing PLAYFAB_TITLE_ID / PLAYFAB_SECRET_KEY in web/.env');
  process.exit(1);
}
const once = (fn, req) =>
  fn === adminPost ? adminPost(req[0], req[1]) : new Promise((res, rej) => fn(req, (e, r) => (e ? rej(e) : res(r.data))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// PlayFab answers the odd 503 "Connection error"; retry those a few times.
const call = async (fn, req) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await once(fn, req);
    } catch (e) {
      if (attempt >= 4 || !(e && (e.code === 503 || e.code === 429))) throw e;
      await sleep(1500 * attempt);
    }
  }
};
// The web service's playfab-sdk predates the segment export API, so those two
// Admin calls go straight to the REST endpoint with the same secret key.
const adminPost = (method, body) =>
  new Promise((res, rej) => {
    const req = https.request(
      {
        host: `${PlayFab.settings.titleId}.playfabapi.com`,
        path: `/Admin/${method}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-SecretKey': PlayFab.settings.developerSecretKey }
      },
      (r) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => {
          let reply;
          try {
            reply = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch (e) {
            return rej({ code: 503, error: 'Connection error', errorMessage: `${method}: non-JSON reply (${r.statusCode})` });
          }
          if (r.statusCode !== 200 || reply.code !== 200) return rej(reply);
          res(reply.data);
        });
      }
    );
    req.on('error', (e) => rej({ code: 503, error: 'Connection error', errorMessage: String(e) }));
    req.end(JSON.stringify(body));
  });
const download = (url) =>
  new Promise((res, rej) => {
    https
      .get(url, (r) => {
        if (r.statusCode !== 200) return rej(new Error(`GET ${url.split('?')[0]} -> ${r.statusCode}`));
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', rej);
  });

const args = process.argv.slice(2);
const DELETE = args.includes('--delete');
const argAfter = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const SINCE = new Date(argAfter('--since') || '2026-05-01');
if (isNaN(SINCE.getTime())) {
  console.error('bad --since date');
  process.exit(1);
}
const outDir = path.join(__dirname, '.dev-logs');
fs.mkdirSync(outDir, { recursive: true });
// Every player's profile (names, last-login city): kept OUT of the repo, in the
// OS temp dir, so a `git add -A` can never pick it up.
const EXPORT_DIR = argAfter('--export-dir') || path.join(require('os').tmpdir(), 'golfcraft-playfab-export');
// Belt and braces: never touch these whatever the data says.
const NEVER_DELETE = new Set(['59DB5EA948C1AE85']);

// Export every player profile (TSV parts) unless a downloaded set is reused.
async function exportAllPlayers() {
  const parts = fs.existsSync(EXPORT_DIR) ? fs.readdirSync(EXPORT_DIR).filter((f) => f.endsWith('.tsv')) : [];
  if (parts.length) {
    console.log(`reusing ${parts.length} export part(s) in ${EXPORT_DIR}`);
    return parts.map((f) => path.join(EXPORT_DIR, f));
  }
  const { Segments } = await call(PlayFabAdmin.GetAllSegments, {});
  const all = Segments.find((s) => /^all players$/i.test(s.Name));
  if (!all) throw new Error('no "All Players" segment: ' + Segments.map((s) => s.Name).join(', '));
  const { ExportId } = await call(adminPost, ['ExportPlayersInSegment', { SegmentId: all.Id }]);
  console.log('export started', ExportId);
  let IndexUrl;
  for (let i = 0; i < 90; i++) {
    const r = await call(adminPost, ['GetSegmentExport', { ExportId }]);
    if (r.State === 'Complete') {
      IndexUrl = r.IndexUrl;
      break;
    }
    if (/fail|error|expired/i.test(r.State || '')) throw new Error('export ' + r.State);
    await sleep(10000);
  }
  if (!IndexUrl) throw new Error('export did not complete in time');
  const urls = (await download(IndexUrl)).split(/\r?\n/).filter(Boolean);
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const files = [];
  for (let i = 0; i < urls.length; i++) {
    const file = path.join(EXPORT_DIR, `part${i + 1}.tsv`);
    fs.writeFileSync(file, await download(urls[i]));
    files.push(file);
  }
  console.log(`downloaded ${files.length} export part(s) to ${EXPORT_DIR}`);
  return files;
}

// The TSV has one header row per part; we need PlayerId, Created, DisplayName.
function readProfiles(files) {
  const profiles = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    const header = lines[0].split('\t');
    const col = (name) => header.indexOf(name);
    const iId = col('PlayerId');
    const iCreated = col('Created');
    const iName = col('DisplayName');
    if (iId < 0 || iCreated < 0) throw new Error(`unexpected header in ${file}`);
    for (const line of lines.slice(1)) {
      const cells = line.split('\t');
      profiles.push({ PlayerId: cells[iId].toUpperCase(), Created: cells[iCreated], DisplayName: cells[iName] || '' });
    }
  }
  return profiles;
}

(async () => {
  const files = await exportAllPlayers();
  const profiles = readProfiles(files);
  const recent = profiles.filter((p) => new Date(p.Created + 'Z') >= SINCE).sort((a, b) => (a.Created < b.Created ? -1 : 1));
  console.log(`players in title: ${profiles.length}; created since ${SINCE.toISOString().slice(0, 10)}: ${recent.length}`);

  const report = [];
  for (const p of recent) {
    const PlayFabId = p.PlayerId;
    let info;
    try {
      info = (
        await call(PlayFabServer.GetPlayerCombinedInfo, {
          PlayFabId,
          InfoRequestParameters: {
            GetUserAccountInfo: true,
            GetUserData: true,
            GetUserReadOnlyData: true,
            GetUserInventory: true,
            GetUserVirtualCurrency: true,
            GetPlayerStatistics: true
          }
        })
      ).InfoResultPayload;
    } catch (e) {
      // Accounts deleted on an earlier run linger in the export for a while.
      if (e && (e.error === 'AccountDeleted' || e.error === 'AccountNotFound')) {
        console.log(`${PlayFabId}  ${p.Created.slice(0, 16)}  -> already ${e.error}`);
        continue;
      }
      throw e;
    }
    const customId = (info.AccountInfo && info.AccountInfo.CustomIdInfo && info.AccountInfo.CustomIdInfo.CustomId) || '';
    const initialized = !!(info.UserReadOnlyData && info.UserReadOnlyData.initialized && info.UserReadOnlyData.initialized.Value);
    const address = (info.UserData && info.UserData.address && info.UserData.address.Value) || '';
    const hasClub = (info.UserInventory || []).some((i) => i.ItemId === 'golfclub-1');
    let linkedTo = '';
    if (address) {
      const gen = await call(PlayFabServer.GetPlayFabIDsFromGenericIDs, { GenericIDs: [{ ServiceName: 'address', UserId: address.toLowerCase() }] });
      linkedTo = (gen.Data[0] && gen.Data[0].PlayFabId) || '';
    }
    const customKind = /^0x[0-9a-f]{40}$/i.test(customId) ? 'wallet' : customId.length === 100 ? 'random' : customId ? 'other' : 'none';
    let verdict;
    if (NEVER_DELETE.has(PlayFabId)) verdict = 'keep (protected)';
    else if (!initialized && !address && !hasClub) verdict = 'ORPHAN';
    else if (address && linkedTo !== PlayFabId) verdict = 'keep (address but not linked, check by hand)';
    else verdict = 'keep';
    const row = {
      PlayFabId,
      created: p.Created,
      displayName: p.DisplayName,
      customId: customKind,
      initialized,
      address: address ? 'yes' : 'no',
      linked: address ? (linkedTo === PlayFabId ? 'yes' : 'NO') : '-',
      golfclub1: hasClub,
      stats: (info.PlayerStatistics || []).length,
      items: (info.UserInventory || []).length,
      GC: (info.UserVirtualCurrency && info.UserVirtualCurrency.GC) || 0,
      verdict
    };
    report.push(row);
    console.log(
      `${PlayFabId}  ${p.Created.slice(0, 16)}  name=${JSON.stringify(row.displayName)}  customId=${customKind}  init=${initialized ? 'y' : 'n'}  address=${row.address}  linked=${row.linked}  club=${hasClub ? 'y' : 'n'}  stats=${row.stats} items=${row.items} GC=${row.GC}  -> ${verdict}`
    );
  }

  const orphans = report.filter((r) => r.verdict === 'ORPHAN');
  const out = path.join(outDir, `orphan-accounts-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(out, JSON.stringify({ since: SINCE, deleted: DELETE, report }, null, 2));
  console.log(`\n${orphans.length} orphan account(s) of ${report.length} checked; report: ${out}`);

  if (!DELETE) {
    if (orphans.length) console.log('dry run: nothing deleted. Re-run with --delete to remove the ORPHAN rows.');
    return;
  }
  for (const r of orphans) {
    await call(PlayFabAdmin.DeletePlayer, { PlayFabId: r.PlayFabId });
    console.log('deleted', r.PlayFabId);
    await sleep(200);
  }
  console.log(`deleted ${orphans.length} account(s)`);
})().catch((e) => {
  console.error('ERROR', e && e.stack ? e.stack : JSON.stringify(e));
  process.exit(1);
});
