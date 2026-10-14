// Prints the API key the deployed PlayFab cloudscript expects in its
// protected handlers (completeSeasonMap and friends). The game server must
// send that same value as PLAYFAB_API_KEY, or every Season run ends with a
// "protected" error and no rewards, xp or season points (CLAUDE.md §6 #26).
//
// It is a secret: pipe it straight into the clipboard, never into a log.
//   node scripts/playfab-cloudscript-key.js | pbcopy
// Read-only: it only downloads the current cloudscript revision.
const fs = require('fs');
const path = require('path');
const webDir = path.join(__dirname, '..', 'web');
const env = fs.readFileSync(path.join(webDir, '.env'), 'utf8');
const get = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').replace(/^"|"$/g, '');
const PlayFab = require(path.join(webDir, 'node_modules/playfab-sdk/Scripts/PlayFab/PlayFab'));
const PlayFabAdmin = require(path.join(webDir, 'node_modules/playfab-sdk/Scripts/PlayFab/PlayFabAdmin'));
PlayFab.settings.titleId = get('PLAYFAB_TITLE_ID');
PlayFab.settings.developerSecretKey = get('PLAYFAB_SECRET_KEY');

PlayFabAdmin.GetCloudScriptRevision({}, (error, result) => {
  if (error) {
    console.error('GetCloudScriptRevision failed', error.errorMessage || error);
    process.exit(1);
  }
  const code = (result.data.Files || []).map((f) => f.FileContents).join('\n');
  // The bundle guards with `if(x!==<name>)throw new Error("protected")`; the
  // name is bound to the key as a string literal elsewhere in the bundle.
  const names = [...code.matchAll(/!==([\w$]+)\)throw (?:new )?Error\("protected"\)/g)].map((m) => m[1]);
  for (const name of new Set(names)) {
    const literal = code.match(new RegExp(`(?:var|let|const|,)\\s*${name.replace('$', '\\$')}\\s*=\\s*"([^"]+)"`));
    if (literal) {
      process.stdout.write(literal[1]);
      return;
    }
  }
  console.error('Could not find the key in the deployed cloudscript');
  process.exit(1);
});
