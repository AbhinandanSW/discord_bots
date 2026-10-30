/**
 * Thin wrapper around Apify's synchronous dataset endpoint.
 * Works with any actor: POST input -> receive dataset items in the response.
 */
export async function fetchApifyItems({ token, actorId, input = {}, limit = 100, timeoutSecs = 280 }) {
  if (!token) throw new Error('APIFY_TOKEN is not set');
  if (!actorId) throw new Error('APIFY_ACTOR_ID is not set');

  // Actors are addressed as "username~actor-name"; accept "username/actor-name" too.
  const actor = String(actorId).trim().replace('/', '~').replace(/^acts\//, '');
  const query = new URLSearchParams({
    token,
    format: 'json',
    clean: 'true',
    limit: String(Math.max(1, Math.min(limit, 1000))),
  });

  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?${query}`;
  const started = Date.now();

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(input ?? {}),
      signal: AbortSignal.timeout(Math.max(30, timeoutSecs) * 1000),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error(
        `Apify actor timed out after ${timeoutSecs}s. Use a smaller APIFY_INPUT_JSON (fewer items) or run the actor on a schedule and import the dataset.`,
      );
    }
    throw new Error(`Apify request failed: ${error.message}`);
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : [];
  } catch {
    throw new Error(`Apify returned non-JSON (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    const detail = payload?.error?.message ?? payload?.message ?? text.slice(0, 300);
    throw new Error(`Apify HTTP ${response.status}: ${detail}`);
  }

  const items = Array.isArray(payload) ? payload : (payload?.items ?? payload?.data?.items ?? []);
  return {
    items: Array.isArray(items) ? items : [],
    tookMs: Date.now() - started,
  };
}
