// Minimal XMLHttpRequest polyfill backed by fetch.
//
// colyseus.js 0.14 does its matchmaking HTTP request (Client.joinOrCreate ->
// createMatchMakeRequest) through httpie/xhr, which uses `new XMLHttpRequest`.
// The SDK7 scene sandbox (bevy-web) has `fetch` but NOT XMLHttpRequest, so
// joining the mission-room throws "XMLHttpRequest is not defined" and the
// course never loads. This shim implements just the surface httpie/xhr touches
// (open / setRequestHeader / send / withCredentials / timeout / onload /
// onerror / ontimeout / status / statusText / response / getAllResponseHeaders).
class FetchXHR {
  method = 'GET'
  url = ''
  withCredentials = false
  timeout = 0
  status = 0
  statusText = ''
  response: any = ''
  responseText = ''
  onload: (() => void) | null = null
  onerror: ((err: any) => void) | null = null
  ontimeout: ((err: any) => void) | null = null

  private reqHeaders: Record<string, string> = {}
  private respHeaders = ''

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  setRequestHeader(key: string, value: string): void {
    this.reqHeaders[key] = value
  }

  getAllResponseHeaders(): string {
    return this.respHeaders
  }

  send(body?: any): void {
    const init: any = { method: this.method, headers: this.reqHeaders }
    if (body !== undefined && body !== null && this.method !== 'GET' && this.method !== 'HEAD') {
      init.body = body
    }
    fetch(this.url, init)
      .then(async (res: any) => {
        this.status = res.status
        this.statusText = res.statusText || ''
        let hs = ''
        try {
          res.headers.forEach((value: string, key: string) => {
            hs += `${key}: ${value}\r\n`
          })
        } catch (_) {
          // Headers without forEach — leave respHeaders empty; httpie tolerates it.
        }
        this.respHeaders = hs
        const text = await res.text()
        this.responseText = text
        this.response = text
        if (this.onload) this.onload()
      })
      .catch((err: any) => {
        if (this.onerror) this.onerror(err || { type: 'error' })
      })
  }
}

const g = globalThis as any
if (typeof g.XMLHttpRequest === 'undefined') {
  g.XMLHttpRequest = FetchXHR
  console.log('[xhr-polyfill] installed fetch-backed XMLHttpRequest')
}
