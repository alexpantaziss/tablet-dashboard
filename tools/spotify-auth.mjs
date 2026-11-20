// Μία φορά: σύνδεση στο Spotify από τον υπολογιστή, για να βγει refresh token για το tablet.
// Χρήση (από τον φάκελο του project): CLIENT_ID=... CLIENT_SECRET=... node tools/spotify-auth.mjs dashboard/dashboard-config.js
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";

const id = process.env.CLIENT_ID, secret = process.env.CLIENT_SECRET, target = process.argv[2];
if (!id || !secret || !target) { console.error("missing CLIENT_ID / CLIENT_SECRET / target"); process.exit(1); }
const redirect = "http://127.0.0.1:8888/callback";
const scope = "user-read-playback-state user-read-currently-playing user-modify-playback-state";
const st = crypto.randomBytes(12).toString("hex");
const url = "https://accounts.spotify.com/authorize?" + new URLSearchParams({ response_type: "code", client_id: id, scope, redirect_uri: redirect, state: st });
console.log("OPEN: " + url);

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1:8888");
  if (u.pathname !== "/callback") { res.writeHead(404); return res.end(); }
  const send = (code, msg) => { res.writeHead(code, { "Content-Type": "text/html; charset=utf-8" }); res.end("<h2 style='font-family:sans-serif'>" + msg + "</h2>"); };
  if (u.searchParams.get("state") !== st) return send(400, "Λάθος state, ξαναδοκίμασε.");
  if (u.searchParams.get("error")) { send(400, "Το Spotify απάντησε: " + u.searchParams.get("error")); console.log("ERROR " + u.searchParams.get("error")); srv.close(); return; }
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64") },
    body: new URLSearchParams({ grant_type: "authorization_code", code: u.searchParams.get("code"), redirect_uri: redirect })
  });
  const j = await r.json();
  if (!j.refresh_token) { send(500, "Αποτυχία: " + JSON.stringify(j)); console.log("FAIL " + JSON.stringify(j)); srv.close(); return; }
  let s = fs.readFileSync(target, "utf8");
  s = s.replace(/clientId: "[^"]*"/, 'clientId: "' + id + '"')
       .replace(/clientSecret: "[^"]*"/, 'clientSecret: "' + secret + '"')
       .replace(/refreshToken: "[^"]*"/, 'refreshToken: "' + j.refresh_token + '"');
  fs.writeFileSync(target, s);
  const me = await (await fetch("https://api.spotify.com/v1/me/player", { headers: { Authorization: "Bearer " + j.access_token } }));
  console.log("OK token saved; player status " + me.status);
  send(200, "Έτοιμο! Μπορείς να κλείσεις αυτή τη σελίδα.");
  srv.close();
});
srv.listen(8888, "127.0.0.1");
