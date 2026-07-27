// SDK6 toast notification. Stubbed for SDK7; messages go to console for now.

export const showMessage = ({ timeout, message }: { timeout: number; message: string }) => {
  console.log(`[server-notification] ${message} (${timeout}ms)`)
}
