Exit code: 0
Wall time: 0.4 seconds
Output:
const FRONTEND_ORIGIN = "https://majos-tech.github.io";
const FRONTEND_URL = "https://majos-tech.github.io/zoho-ppt-agent/";
const ZOHO_ACCOUNTS_URL = "https://accounts.zoho.in";
const ZOHO_SCOPE = "ZohoAnalytics.data.read";
const OAUTH_STATE_COOKIE = "ppt_agent_zoho_state";

const corsHeaders = {
  "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: corsHeaders });
}

function pathMatches(pathname: string, pattern: RegExp): boolean {
  return pattern.test(pathname);
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

function stateCookie(value: string, maxAge: number): string {
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 302, headers });
}

function callbackUrl(url: URL): string {
  return `${url.origin}/auth/zoho/callback`;
}

type ZohoTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== FRONTEND_ORIGIN) {
        return json({ message: "Origin not allowed." }, 403);
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      const refreshToken = await env.PPT_AGENT_ZOHO_TOKENS.get("refresh_token");
      return json({
        status: "ok",
        service: "zoho-ppt-agent",
        zoho: refreshToken ? "connected" : "not_connected",
        version: "0.1.0",
      });
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/auth/zoho" || url.pathname === "/auth/zoho/start")
    ) {
      const state = crypto.randomUUID();
      const authorizationUrl = new URL("/oauth/v2/auth", ZOHO_ACCOUNTS_URL);
      authorizationUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: env.ZOHO_CLIENT_ID,
        redirect_uri: callbackUrl(url),
        scope: ZOHO_SCOPE,
        access_type: "offline",
        prompt: "consent",
        state,
      }).toString();
      return redirect(authorizationUrl.toString(), [stateCookie(state, 600)]);
    }

    if (request.method === "GET" && url.pathname === "/auth/zoho/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const expectedState = readCookie(request, OAUTH_STATE_COOKIE);

      if (!code || !state || !expectedState || state !== expectedState) {
        return json({ message: "Invalid or expired Zoho authorization state." }, 400);
      }

      try {
        const tokenResponse = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: callbackUrl(url),
            client_id: env.ZOHO_CLIENT_ID,
            client_secret: env.ZOHO_CLIENT_SECRET,
          }),
        });
        const token = await tokenResponse.json<ZohoTokenResponse>();

        if (!tokenResponse.ok || !token.refresh_token) {
          console.error(JSON.stringify({
            event: "zoho_oauth_exchange_failed",
            status: tokenResponse.status,
            zohoError: token.error ?? "refresh_token_missing",
          }));
          return json(
            { message: "Zoho authorization did not return an offline refresh token." },
            502,
          );
        }

        await env.PPT_AGENT_ZOHO_TOKENS.put("refresh_token", token.refresh_token);
        const frontend = new URL(FRONTEND_URL);
        frontend.searchParams.set("zoho", "connected");
        return redirect(frontend.toString(), [stateCookie("", 0)]);
      } catch (error) {
        console.error(JSON.stringify({
          event: "zoho_oauth_callback_error",
          message: error instanceof Error ? error.message : "unknown_error",
        }));
        return json({ message: "Zoho authorization could not be completed." }, 502);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/decks") {
      return json(
        {
          message:
            "The Cloudflare API is online. Connect Zoho and configure the presentation renderer before generating a deck.",
        },
        503,
      );
    }

    if (
      request.method === "GET" &&
      pathMatches(url.pathname, /^\/api\/decks\/[^/]+$/)
    ) {
      return json({ message: "Deck job not found." }, 404);
    }

    return json({ message: "Route not found." }, 404);
  },
} satisfies ExportedHandler;

