// Shared HTTP handling for the utility APIs, called straight from the app (ADR 0011).
// The user pastes a refresh token for the session; it's never stored.

export type Fetch = typeof fetch

export class UtilityApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'UtilityApiError'
    this.status = status
  }
}

/** GET or POST JSON with a bearer token, turning failures into messages a user can act on. */
export async function requestJson<T>(
  doFetch: Fetch,
  service: string,
  url: string,
  token: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  let response: Response
  try {
    response = await doFetch(url, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    // A CSP block and a network failure look the same from here.
    throw new UtilityApiError(
      `${service} kunne ikke nås. Inde i Power Apps skal en administrator tillade api.eloverblik.dk og api.varmeoverblik.dk under connect-src i miljøets Content Security Policy.`,
      null,
    )
  }
  if (response.ok) return (await response.json()) as T
  if (response.status === 401 || response.status === 403) {
    throw new UtilityApiError(`${service} afviste tokenet. Det er måske udløbet eller tilbagekaldt; opret et nyt.`, response.status)
  }
  if (response.status === 429 || response.status === 503) {
    throw new UtilityApiError(`${service} er travl eller begrænser antallet af kald. Vent et minut, og prøv igen.`, response.status)
  }
  throw new UtilityApiError(`${service} svarede med fejl ${response.status}.`, response.status)
}
