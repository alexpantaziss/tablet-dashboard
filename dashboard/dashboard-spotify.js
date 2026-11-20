/* dashboard-spotify.js
   Κάρτα "Παίζει τώρα" (Spotify): όταν παίζει μουσική σε οποιαδήποτε συσκευή του λογαριασμού,
   παίρνει τη θέση του "Coffee corner". Όταν σταματήσει (και περάσουν SPOT.keepPausedMin), γυρίζει ο καφές.
   Χρειάζεται μια δική σου εφαρμογή στο developer.spotify.com (Client ID / Secret) και ένα refresh token
   που βγαίνει μία φορά με σύνδεση στον λογαριασμό. Ακύρωση πρόσβασης: spotify.com > Λογαριασμός >
   Διαχείριση εφαρμογών > Κατάργηση πρόσβασης. Τα κουμπιά ελέγχου θέλουν Premium. */
var SPOTIFY = (window.LOCAL && LOCAL.SPOTIFY) || { clientId: "", clientSecret: "", refreshToken: "" };
(function(){
var SPOT_DEMO = /[?&]spotdemo=1/.test(location.search);   // δοκιμή εμφάνισης χωρίς λογαριασμό
if(!SPOT_DEMO && (!SPOTIFY.clientId || !SPOTIFY.refreshToken)) return;   // χωρίς στοιχεία η κάρτα δεν εμφανίζεται ποτέ

var SPOT = { pollPlayingSec: 5, pollIdleSec: 20, pollNightSec: 60, keepPausedMin: 10 };
var root = document.documentElement, API = "https://api.spotify.com/v1/me/player";
var token = null, tokenExp = 0, state = null, lastPlaying = 0, pollTimer = null, tickTimer = null, busy = false;

/* ---------- token ---------- */
function refreshTok(){
  var saved = load("spot_rt"), rt = saved && saved.v ? saved.v : SPOTIFY.refreshToken;
  return fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic " + btoa(SPOTIFY.clientId + ":" + SPOTIFY.clientSecret) },
    body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(rt)
  }).then(function(r){
    if(!r.ok){ if(saved){ try{ localStorage.removeItem("hcc_spot_rt"); }catch(e){} } throw new Error("token HTTP " + r.status); }
    return r.json();
  }).then(function(j){
    token = j.access_token; tokenExp = Date.now() + (j.expires_in - 60) * 1000;
    if(j.refresh_token) store("spot_rt", j.refresh_token);   // το Spotify μπορεί να δώσει νέο
    return token;
  });
}
function getTok(){ return token && Date.now() < tokenExp ? Promise.resolve(token) : refreshTok(); }
function api(method, path){
  return getTok().then(function(t){
    return fetch(API + (path || ""), { method: method, headers: { "Authorization": "Bearer " + t } });
  }).then(function(r){
    if(r.status === 401){ token = null; }
    return r;
  });
}

/* ---------- κατάσταση ---------- */
function poll(){
  clearTimeout(pollTimer);
  api("GET", "?additional_types=episode").then(function(r){
    if(r.status === 204) return null;
    if(!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function(j){
    state = j && j.item ? j : null;
    if(state){ state.at = Date.now(); if(state.is_playing) lastPlaying = Date.now(); }
    render();
    if(typeof mark === "function") mark("Spotify", true);
  }).catch(function(e){
    if(typeof mark === "function") mark("Spotify", false, e.message);
  }).then(schedule, schedule);
}
function schedule(){
  clearTimeout(pollTimer);
  var night = document.body.className.indexOf("night") >= 0 && !/\bawake\b/.test(root.className);
  var sec = night ? SPOT.pollNightSec : (state && state.is_playing ? SPOT.pollPlayingSec : SPOT.pollIdleSec);
  pollTimer = setTimeout(poll, sec * 1000);
}
function visible(){
  // σε παύση: φαίνεται για keepPausedMin από την τελευταία αλλαγή (timestamp του Spotify) ή από όταν το είδαμε να παίζει
  return !!state && (state.is_playing || Date.now() - Math.max(lastPlaying, state.timestamp || 0) < SPOT.keepPausedMin * 60000);
}

/* ---------- σχεδίαση ---------- */
function mmss(ms){ var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }
function render(){
  var on = visible();
  root.className = root.className.replace(/\s*\bspot-on\b/g, "") + (on ? " spot-on" : "");
  clearInterval(tickTimer);
  if(!on) return;
  var it = state.item, ep = it.type === "episode";
  var imgs = ep ? (it.images || (it.show && it.show.images) || []) : ((it.album && it.album.images) || []);
  var img = imgs.length ? (imgs[1] || imgs[0]).url : "";
  var art = $("sp-art");
  if(art.getAttribute("data-src") !== img){ art.setAttribute("data-src", img); art.style.backgroundImage = img ? 'url("' + img + '")' : "none"; }
  $("sp-title").textContent = it.name || "";
  $("sp-artist").textContent = ep ? ((it.show && it.show.name) || "") : (it.artists || []).map(function(a){ return a.name; }).join(", ");
  $("sp-dev").textContent = state.device && state.device.name ? state.device.name : "";
  $("sp-eye-s").textContent = state.is_playing ? "Παίζει τώρα" : "Σε παύση";
  var pb = $("sp-play");
  pb.innerHTML = state.is_playing ? ICON.pause : ICON.play;
  pb.setAttribute("aria-label", state.is_playing ? "Παύση" : "Αναπαραγωγή");
  tick(); if(state.is_playing) tickTimer = setInterval(tick, 1000);
}
function tick(){
  if(!state) return;
  var dur = state.item.duration_ms || 1, pos = state.progress_ms + (state.is_playing ? Date.now() - state.at : 0);
  pos = Math.min(pos, dur);
  $("sp-fill").style.width = (pos / dur * 100).toFixed(2) + "%";
  $("sp-cur").textContent = mmss(pos);
  $("sp-dur").textContent = "-" + mmss(dur - pos);
  if(pos >= dur && state.is_playing){ clearInterval(tickTimer); setTimeout(poll, 800); }   // τέλος κομματιού: φέρε το επόμενο
}
var ICON = {
  play:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.04-6.86a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="4.25" height="15" rx="1.2"/><rect x="13.75" y="4.5" width="4.25" height="15" rx="1.2"/></svg>',
  next:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.2v11.6a.9.9 0 0 0 1.38.76L13.5 13.2V17.8a.9.9 0 0 0 1.38.76l8.4-5.8a.9.9 0 0 0 0-1.52l-8.4-5.8A.9.9 0 0 0 13.5 6.2v4.6L5.38 5.44A.9.9 0 0 0 4 6.2z"/></svg>',
  prev:  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6.2v11.6a.9.9 0 0 1-1.38.76L10.5 13.2V17.8a.9.9 0 0 1-1.38.76l-8.4-5.8a.9.9 0 0 1 0-1.52l8.4-5.8A.9.9 0 0 1 10.5 6.2v4.6l8.12-5.36A.9.9 0 0 1 20 6.2z"/></svg>'
};
$("sp-prev").innerHTML = ICON.prev; $("sp-next").innerHTML = ICON.next; $("sp-play").innerHTML = ICON.play;

/* ---------- κουμπιά ---------- */
function act(method, path, optimistic){
  if(busy) return; busy = true;
  if(optimistic) optimistic();
  api(method, path).then(function(r){
    if(r.status === 403) toast("Το Spotify δεν επέτρεψε τον έλεγχο (χρειάζεται Premium).");
    else if(r.status === 404) toast("Δεν βρέθηκε ενεργή συσκευή Spotify.");
    else if(!r.ok && r.status !== 204) toast("Spotify: σφάλμα " + r.status);
  }).catch(function(){ toast("Δεν υπάρχει σύνδεση με το Spotify."); })
  .then(function(){ busy = false; setTimeout(poll, 700); });
}
$("sp-play").addEventListener("click", function(){
  if(!state) return;
  var playing = state.is_playing;
  act("PUT", playing ? "/pause" : "/play", function(){
    state.progress_ms += playing ? Date.now() - state.at : 0; state.at = Date.now();
    state.is_playing = !playing; if(!playing) lastPlaying = Date.now(); render();
  });
});
$("sp-next").addEventListener("click", function(){ act("POST", "/next"); });
$("sp-prev").addEventListener("click", function(){ act("POST", "/previous"); });

if(SPOT_DEMO){
  state = { is_playing:true, progress_ms:83000, at:Date.now(), device:{ name:"Σαλόνι" },
    item:{ type:"track", name:"Ένα τραγούδι με αρκετά μεγάλο τίτλο για δοκιμή", duration_ms:214000,
      artists:[{name:"Καλλιτέχνης"},{name:"Δεύτερος"}], album:{ images:[] } } };
  lastPlaying = Date.now(); render(); return;
}
setTimeout(poll, 3000);
})();
