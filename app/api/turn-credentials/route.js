/**
 * Mints short-lived Cloudflare Realtime TURN credentials server-side.
 * Returns { iceServers: [...] } for RTCPeerConnection.
 *
 * See:
 * https://developers.cloudflare.com/realtime/turn/generate-credentials/
 *
 * Requires:
 *   CF_TURN_TOKEN_ID  — TURN key UID from Calls dashboard / API create response
 *   CF_TURN_API_TOKEN — Bearer secret returned when the TURN key was created
 *                       (dashboard labels vary; keep server-side only)
 *
 * If env vars are absent, returns an empty list and the client falls back to
 * Google STUN only.
 */
export async function GET() {
  const tokenId = process.env.CF_TURN_TOKEN_ID;
  const apiToken = process.env.CF_TURN_API_TOKEN;

  if (!tokenId || !apiToken) {
    return Response.json({ iceServers: [] });
  }

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(tokenId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: 172800 }), // 48 hours (seconds), per CF docs
      },
    );

    if (!res.ok) {
      console.error('[turn-credentials] CF API error:', res.status);
      return Response.json({ iceServers: [] });
    }

    const data = await res.json();
    let iceServers = data.iceServers ?? [];

    // CF returns alternate STUN/TURN on port 53; browsers may stall ICE without trickle ICE.
    iceServers = iceServers.map((entry) => {
      const urls = entry.urls;
      if (!Array.isArray(urls)) return entry;
      const filtered = urls.filter((u) => !String(u).includes(':53'));
      return { ...entry, urls: filtered.length ? filtered : urls };
    });

    return Response.json({ iceServers });
  } catch (err) {
    console.error('[turn-credentials] fetch failed:', err);
    return Response.json({ iceServers: [] });
  }
}
