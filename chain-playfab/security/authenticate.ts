import type { Request } from 'express'
import 'isomorphic-fetch'

const catalystUrl =
  'https://peer-lb.decentraland.org/lambdas/crypto/validate-signature'

type AuthLink = {
  type: AuthLinkType
  payload: string
  signature: Signature
}

enum AuthLinkType {
  SIGNER = 'SIGNER',
  ECDSA_PERSONAL_EPHEMERAL = 'ECDSA_EPHEMERAL',
  ECDSA_PERSONAL_SIGNED_ENTITY = 'ECDSA_SIGNED_ENTITY',
  ECDSA_EIP_1654_EPHEMERAL = 'ECDSA_EIP_1654_EPHEMERAL',
  ECDSA_EIP_1654_SIGNED_ENTITY = 'ECDSA_EIP_1654_SIGNED_ENTITY',
}

export type Signature = string

const AUTH_CHAIN_HEADER_PREFIX = 'x-identity-auth-chain-'
const AUTH_TIMESTAMP_HEADER = 'x-identity-timestamp'
const AUTH_METADATA_HEADER = 'x-identity-metadata'

function buildAuthChain(
  req: Request
): [AuthLink[], number | undefined, string] {
  let index = 0
  const chain: AuthLink[] = []

  while (req.headers[AUTH_CHAIN_HEADER_PREFIX + index]) {
    chain.push(
      JSON.parse(req.headers[AUTH_CHAIN_HEADER_PREFIX + index] as string)
    )
    index++
  }

  const timestampString = req.header(AUTH_TIMESTAMP_HEADER)
  const metadata = req.header(AUTH_METADATA_HEADER)

  const timestamp = timestampString ? parseInt(timestampString, 10) : undefined
  return [chain, timestamp, metadata ?? '']
}

// We want all signatures to be "current". We consider "current" to be the current time,
// with a 10 minute tolerance to account for network delays and possibly unsynched clocks
export const VALID_SIGNATURE_TOLERANCE_INTERVAL_MS = 10 * 1000 * 60

function validSignatureInterval(timestamp: number) {
  const currentTime = Date.now()
  return (
    timestamp > currentTime - VALID_SIGNATURE_TOLERANCE_INTERVAL_MS &&
    timestamp < currentTime + VALID_SIGNATURE_TOLERANCE_INTERVAL_MS
  )
}

type ValidateSignatureResponse = {
  valid: boolean
  ownerAddress: string
  error?: string
}

export async function authenticateUsingAuthChain(
  req: Request
): Promise<boolean> {
  const [chain, timestamp, metadata] = buildAuthChain(req)

  if (chain.length === 0) {
    // Can't authenticate. Invalid authchain
    return false
  } else if (typeof timestamp === 'undefined') {
    // Can't authenticate. Invalid timestamp
    return false
  } else if (!validSignatureInterval(timestamp)) {
    // Can't authenticate. Timestamp too old or too far into the future
    console.log('authChain rejected: timestamp', timestamp, 'vs now', Date.now())
    return false
  } else {
    // Validate against Catalyst Server. The signed payload is
    // method:path:timestamp:metadata. The kernel, the Unity desktop client and
    // decentraland-crypto-middleware lowercase the WHOLE string before signing;
    // bevy-web (the web explorer on decentraland.org) lowercases only method
    // and path and signs the metadata JSON as sent, so its camelCase keys
    // ("sceneId", "isGuest") never matched the lowercased string and every one
    // of its logins was rejected. Both spellings are signed by the same
    // ephemeral key over the same request, so either is proof enough: try the
    // lowercased one first, then the as-sent one.
    const method = req.method.toLowerCase()
    const path = req.originalUrl.toLowerCase()
    const lowercased = [method, path, timestamp.toString(), metadata].join(':').toLowerCase()
    const asSent = [method, path, timestamp.toString(), metadata].join(':')
    const candidates = lowercased === asSent ? [lowercased] : [lowercased, asSent]

    let result: ValidateSignatureResponse = { valid: false, ownerAddress: '' }
    for (const signaturePayload of candidates) {
      const body = JSON.stringify({
        authChain: chain,
        timestamp: signaturePayload,
      }) // we send the endpoint as the timestamp, yes

      const resp = await fetch(`${catalystUrl}`, {
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      })

      result = (await resp.json()) as ValidateSignatureResponse
      if (result.valid) break
    }

    if (!result.valid) {
      // Can't authenticate. Invalid signature
      console.log('authChain rejected by catalyst:', result.error, 'chain types:', chain.map((l) => l.type).join('>'))
      return false
    } else {
      req.params.address = chain[0].payload
      req.params.addressLowercase = chain[0].payload.toLowerCase()
      req.params.authMetadata = metadata
      return true
    }
  }
}