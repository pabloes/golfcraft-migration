// What build is live. Shown in small print at the bottom of the screen so the
// deployed version can be read from inside the game instead of guessed (user,
// 2026-11-05, after an hour spent wondering whether a fix had shipped).
//
// scripts/build-scene-prod.sh overwrites this file with the commit and the
// date right before a production build and puts it back afterwards, so the
// number on screen always names the commit that was deployed. A local build
// keeps 'dev'.
export const SCENE_VERSION = 'dev'
