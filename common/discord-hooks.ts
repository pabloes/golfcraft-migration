// Every Discord webhook the backend posts to, by name, read from the
// environment (2026-11-04, before the repository was opened up).
//
// A webhook URL is a credential: anyone holding it can post to that channel,
// so none of them may sit in the source. Each name below is an env var of the
// same name; set them on the CapRover apps (ws, web, chain-playfab). A name
// with no value simply does not post, and says so once in the log, so a
// missing var never breaks a game action.
//
// The scene never imports this file (no process.env in the SDK7 sandbox).
export type DiscordHookName =
  | 'DISCORD_HOOK_DEFAULT'
  | 'DISCORD_HOOK_ADMIN'
  | 'DISCORD_HOOK_WEARABLE_FOUND'
  | 'DISCORD_HOOK_PLAYER_CONNECTED'
  | 'DISCORD_HOOK_DCL_AWARDS_LOG'
  | 'DISCORD_HOOK_TOURNAMENT'
  | 'DISCORD_HOOK_LIVE_TOURNAMENT'
  | 'DISCORD_HOOK_COURSES'
  | 'DISCORD_HOOK_PLAYFAB_EVENTS'
  | 'DISCORD_HOOK_DAILY_MISSIONS'
  | 'DISCORD_HOOK_WEB_ALERTS'
  | 'DISCORD_HOOK_WEB_DEFAULT'
  | 'DISCORD_HOOK_GOLFCLUB_PUBLIC'
  | 'DISCORD_HOOK_VOXTER_PUBLIC'
  | 'DISCORD_HOOK_SURPRISE'

const warned: { [name: string]: boolean } = {}

// The webhook URL for `name`, or "" when it is not configured here.
export function discordHook(name: DiscordHookName): string {
  const url = (process.env[name] || '').trim()
  if (!url) {
    if (!warned[name]) {
      warned[name] = true
      console.log(`[discord] ${name} is not set: those messages are not posted`)
    }
    return ''
  }
  return url
}
