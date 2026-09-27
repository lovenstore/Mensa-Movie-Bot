const http = require("node:http");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { getSubscription, getBotForUser } = require("./lib/database");

const port = Number(process.env.PORT || process.env.PORTAL_PORT || 8787);
const origin = (process.env.WEB_ORIGIN || "*").replace(/\/$/, "");
const cookieSecret = process.env.COOKIE_SECRET || "";
const secureCookie = process.env.COOKIE_SECURE !== "false";

function normalizeRedirectUri(value) {
  try {
    const parsed = new URL(value);
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
    return parsed.toString();
  } catch {
    return value;
  }
}

const discordRedirectUri = normalizeRedirectUri(process.env.DISCORD_REDIRECT_URI || "");

function sign(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", cookieSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verify(value) {
  if (!cookieSecret || !value) return null;
  try {
    const [encoded, signature] = value.split(".");
    const expected = crypto.createHmac("sha256", cookieSecret).update(encoded).digest("base64url");
    if (!encoded || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function cookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").filter(Boolean).map((item) => {
    const index = item.indexOf("="); return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1).trim())];
  }));
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" });
  response.end(JSON.stringify(payload));
}

function discordAsset(type, userId, hash) {
  if (!hash) return null;
  const extension = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/${type}/${userId}/${hash}.${extension}?size=1024`;
}

function startPortal() {
  if (!cookieSecret || !process.env.DISCORD_CLIENT_SECRET || !process.env.DISCORD_REDIRECT_URI) {
    console.warn("[Mensa Movie] Portal disabled. Set COOKIE_SECRET, DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI to enable website subscription login.");
    return;
  }
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === "OPTIONS") { response.writeHead(204, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type" }); return response.end(); }
    if (url.pathname === "/auth/discord") {
      const returnTo = url.searchParams.get("returnTo") || process.env.WEB_ORIGIN || "/";
      const state = Buffer.from(JSON.stringify({ returnTo, nonce: crypto.randomBytes(18).toString("hex"), exp: Date.now() + 10 * 60 * 1000 })).toString("base64url");
      const auth = new URL("https://discord.com/oauth2/authorize");
      auth.searchParams.set("client_id", process.env.CLIENT_ID); auth.searchParams.set("response_type", "code"); auth.searchParams.set("redirect_uri", discordRedirectUri); auth.searchParams.set("scope", "identify"); auth.searchParams.set("state", state);
      response.writeHead(302, { Location: auth.toString() }); return response.end();
    }
    if (url.pathname === "/auth/callback") {
      try {
        const tokenResponse = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code: url.searchParams.get("code"), redirect_uri: discordRedirectUri }) });
        const token = await tokenResponse.json();
        const userResponse = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${token.access_token}` } });
        const user = await userResponse.json();
        const state = JSON.parse(Buffer.from(url.searchParams.get("state") || "", "base64url").toString("utf8"));
         const profile = {
           id: user.id,
           name: user.global_name || user.username || "Mensa Member",
           username: user.username || "",
           avatarUrl: discordAsset("avatars", user.id, user.avatar),
           bannerUrl: user.premium_type === 2 ? discordAsset("banners", user.id, user.banner) : null,
           hasNitro: user.premium_type === 2
         };
         const session = sign({ userId: user.id, profile, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
        const cookieFlags = `HttpOnly; ${secureCookie ? "Secure; SameSite=None" : "SameSite=Lax"}; Path=/; Max-Age=604800`;
         const returnUrl = new URL(state.returnTo || process.env.WEB_ORIGIN || "/", process.env.WEB_ORIGIN || "http://localhost");
         const allowedOrigin = new URL(process.env.WEB_ORIGIN || returnUrl.origin).origin;
         const safeReturnTo = returnUrl.origin === allowedOrigin ? returnUrl.toString() : `${allowedOrigin}/`;
         response.writeHead(302, { "Set-Cookie": `mensa_session=${encodeURIComponent(session)}; ${cookieFlags}`, Location: safeReturnTo }); return response.end();
      } catch (error) { return sendJson(response, 502, { error: "Discord authentication failed" }); }
    }
    if (url.pathname === "/api/me") {
      const session = verify(cookies(request).mensa_session);
      if (!session) return sendJson(response, 401, { authenticated: false });
      const subscription = getSubscription(session.userId);
      const bot = getBotForUser(session.userId);
       return sendJson(response, 200, { authenticated: true, userId: session.userId, profile: session.profile || null, active: Boolean(subscription && subscription.expires_at > Date.now()), subscription, bot: bot ? { id: bot.bot_user_id, status: bot.status, guildId: bot.guild_id } : null });
    }
    if (url.pathname === "/api/invite") {
      const session = verify(cookies(request).mensa_session);
      const bot = session && getBotForUser(session.userId);
      if (!bot?.bot_user_id) return sendJson(response, 404, { error: "No assigned bot" });
      return sendJson(response, 200, { url: `https://discord.com/oauth2/authorize?client_id=${bot.bot_user_id}&scope=bot%20applications.commands&permissions=36700160` });
    }
    return sendJson(response, 404, { error: "Not found" });
  });
  server.listen(port, () => console.log(`[Mensa Movie] Subscription portal listening on :${port}`));
}

module.exports = { startPortal };