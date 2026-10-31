// SDK6 scene/src/components/server-notification.ts: one message in a dark box
// at the top centre, hidden after `timeout` ms. The state lives here and
// <ServerNotification /> in ui/index.tsx draws it (it used to be a console.log
// stub, so every refusal, e.g. the party lobby's, was invisible).
export const serverNotificationState: { message: string; until: number } = { message: '', until: 0 }

export const showMessage = ({ timeout, message }: { timeout?: number; message: string }) => {
  console.log(`[server-notification] ${message} (${timeout}ms)`)
  // SDK6 messages carry <color=..> markup (GameLobbyRoom's energy bonus), which
  // SDK7 labels print as is.
  serverNotificationState.message = String(message ?? '').replace(/<\/?color[^>]*>/g, '')
  serverNotificationState.until = Date.now() + (timeout || 3000)
}
