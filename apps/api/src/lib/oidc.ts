import { Issuer, generators, type Client } from "openid-client"
import { env } from "./env"

// Lazy singleton — discovery is deferred to the first auth request so the
// server starts up even when OAUTH_ISSUER_URL is unreachable (e.g. in tests).
let _client: Client | null = null
let _initPromise: Promise<Client> | null = null

async function init(): Promise<Client> {
  const issuer = await Issuer.discover(env.oauthIssuerUrl)
  return new issuer.Client({
    client_id: env.oauthClientId,
    client_secret: env.oauthClientSecret,
    redirect_uris: [env.oauthRedirectUri],
    response_types: ["code"],
  })
}

export async function getOidcClient(): Promise<Client> {
  if (_client) return _client
  // Coalesce concurrent calls into a single discovery request.
  _initPromise ??= init().then((c) => {
    _client = c
    _initPromise = null
    return c
  })
  return _initPromise
}

export { generators }

// For tests — reset the cached client so discovery is re-triggered.
export function _resetOidcClient(): void {
  _client = null
  _initPromise = null
}
