// Pairing without internet: two phones on the same Wi-Fi (or one phone's
// hotspot) connect over WebRTC with no relay. The connection details travel as
// QR codes instead: the host shows an offer, the guest scans it and shows an
// answer, and the host scans that. Only what WebRTC needs is packed into each
// code (ICE credentials, the DTLS fingerprint and local addresses), so the QR
// codes stay small enough to scan easily.
//
// The connected phones get a room with the same shape app.js uses for
// Trystero: makeAction(), onPeerJoin, onPeerLeave and leave().

const OFFER = "DND1o", ANSWER = "DND1a";
const RTC = { iceServers: [] }; // local addresses only, nothing to look up online
const MAX_CANDIDATES = 4;

export const isOffer = (text) => typeof text === "string" && text.startsWith(OFFER + "|");
export const isAnswer = (text) => typeof text === "string" && text.startsWith(ANSWER + "|");

// ---------- Connection codes ----------
const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function pack(prefix, sdp) {
  const attr = (k) => sdp.match(new RegExp(`^a=${k}:(.+?)\\s*$`, "m"))?.[1];
  const ufrag = attr("ice-ufrag"), pwd = attr("ice-pwd"), setup = attr("setup"), mid = attr("mid");
  const [algo, hex] = (attr("fingerprint") || "").split(" ");
  if (!ufrag || !pwd || !setup || !mid || algo?.toLowerCase() !== "sha-256" || !hex) throw new Error("bad-sdp");
  // UDP host candidates: plain IPv4 first, then hidden (.local) names, then IPv6
  const seen = new Set(), cands = [];
  for (const m of sdp.matchAll(/^a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ host/gim)) {
    const c = `${m[1]} ${m[2]}`;
    if (!seen.has(c)) { seen.add(c); cands.push({ c, rank: m[1].includes(":") ? 2 : m[1].endsWith(".local") ? 1 : 0 }); }
  }
  if (!cands.length) throw new Error("no-network");
  cands.sort((a, b) => a.rank - b.rank);
  const fp = b64(hex.split(":").map((h) => parseInt(h, 16)));
  return [prefix, ufrag, pwd, fp, setup, mid, cands.slice(0, MAX_CANDIDATES).map((x) => x.c).join(",")].join("|");
}

function unpack(text, prefix) {
  const f = String(text).split("|");
  if (f[0] !== prefix || f.length !== 7) throw new Error("bad-code");
  const [, ufrag, pwd, fp, setup, mid, cands] = f;
  const ice = /^[A-Za-z0-9+/]{4,256}$/;
  if (!ice.test(ufrag) || !ice.test(pwd) || !/^(actpass|active|passive)$/.test(setup) || !/^[A-Za-z0-9_-]{1,32}$/.test(mid)) throw new Error("bad-code");
  const bytes = unb64(fp);
  if (bytes.length !== 32) throw new Error("bad-code");
  const list = cands.split(",").map((c) => c.split(" ")).filter(([ip, port]) => /^[0-9A-Za-z.:-]{1,64}$/.test(ip || "") && /^\d{1,5}$/.test(port || ""));
  if (!list.length) throw new Error("bad-code");
  return { ufrag, pwd, setup, mid, cands: list, fp: Array.from(bytes, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":") };
}

// a minimal data-channel-only session description, rebuilt from a code
function sdpFrom(p) {
  return [
    "v=0", `o=- ${Date.now()} 2 IN IP4 127.0.0.1`, "s=-", "t=0 0",
    `a=group:BUNDLE ${p.mid}`, "a=msid-semantic: WMS",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0",
    ...p.cands.map(([ip, port], i) => `a=candidate:${i + 1} 1 udp ${2122260223 - i} ${ip} ${port} typ host generation 0`),
    `a=ice-ufrag:${p.ufrag}`, `a=ice-pwd:${p.pwd}`, `a=fingerprint:sha-256 ${p.fp}`,
    `a=setup:${p.setup}`, `a=mid:${p.mid}`, "a=sctp-port:5000", "a=max-message-size:262144", ""
  ].join("\r\n");
}

// wait until every local address is known (no servers to ask, so it's quick)
function gathered(pc, ms = 4000) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const t = setTimeout(resolve, ms);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") { clearTimeout(t); resolve(); }
    });
  });
}

function channel(pc) {
  // negotiated on both sides with the same id, so neither waits for the other to open it
  return pc.createDataChannel("dnd", { negotiated: true, id: 0, ordered: true });
}

function opened(pc, ch, ms) {
  return new Promise((resolve, reject) => {
    const fail = (why) => { clearTimeout(t); reject(new Error(why)); };
    const t = setTimeout(() => fail("timeout"), ms);
    if (ch.readyState === "open") { clearTimeout(t); return resolve(room(pc, ch)); }
    ch.addEventListener("open", () => { clearTimeout(t); resolve(room(pc, ch)); }, { once: true });
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed") fail("unreachable");
      else if (pc.connectionState === "closed") fail("closed");
    });
  });
}

// Host: make the offer to show as a QR code, then finish with the scanned answer.
export async function startOffer() {
  const pc = new RTCPeerConnection(RTC), ch = channel(pc);
  try {
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    return {
      payload: pack(OFFER, pc.localDescription.sdp),
      async finish(text) {
        await pc.setRemoteDescription({ type: "answer", sdp: sdpFrom(unpack(text, ANSWER)) });
        return opened(pc, ch, 20000);
      },
      close: () => pc.close()
    };
  } catch (e) { pc.close(); throw e; }
}

// Guest: answer a scanned offer; `opened` resolves once the host scans the answer.
export async function answerOffer(text) {
  const p = unpack(text, OFFER);
  const pc = new RTCPeerConnection(RTC), ch = channel(pc);
  try {
    await pc.setRemoteDescription({ type: "offer", sdp: sdpFrom(p) });
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    const payload = pack(ANSWER, pc.localDescription.sdp);
    const done = opened(pc, ch, 5 * 60000);
    done.catch(() => {}); // a cancelled pairing rejects with nobody listening
    return { payload, opened: done, close: () => pc.close() };
  } catch (e) { pc.close(); throw e; }
}

// ---------- The connected room ----------
function room(pc, ch) {
  const peer = "wifi-" + Math.random().toString(36).slice(2, 10);
  const actions = new Map();
  let joinFn = null, leaveFn = null, gone = false;
  const lost = () => { if (gone) return; gone = true; leaveFn?.(peer); };
  ch.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch (err) { return; }
    if (Array.isArray(m) && typeof m[0] === "string") actions.get(m[0])?.onMessage?.(m[1], { peerId: peer });
  };
  ch.onclose = lost;
  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") lost();
  });
  return {
    makeAction(name) {
      const a = { onMessage: null, send: async (data) => { if (ch.readyState === "open") ch.send(JSON.stringify([name, data])); } };
      actions.set(name, a);
      return a;
    },
    get onPeerJoin() { return joinFn; },
    // like Trystero, a peer that's already here is replayed to a new handler
    set onPeerJoin(f) { joinFn = f; if (f && !gone && ch.readyState === "open") f(peer); },
    get onPeerLeave() { return leaveFn; },
    set onPeerLeave(f) { leaveFn = f; },
    leave() { gone = true; try { ch.close(); } catch (e) { /* closed */ } pc.close(); }
  };
}

// ---------- Camera scanner ----------
async function detector() {
  if ("BarcodeDetector" in window) {
    try {
      if ((await BarcodeDetector.getSupportedFormats()).includes("qr_code")) {
        const d = new BarcodeDetector({ formats: ["qr_code"] });
        return async (video) => (await d.detect(video)).map((c) => c.rawValue);
      }
    } catch (e) { /* fall back to jsQR */ }
  }
  const jsQR = (await import("./vendor/jsqr.js")).default;
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return [];
    const s = Math.min(1, 720 / Math.max(w, h));
    canvas.width = Math.round(w * s); canvas.height = Math.round(h * s);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
    return hit ? [hit.data] : [];
  };
}

// Show the back camera in `video` until a QR code passes `accept`; resolves with its text.
export async function scan(video, accept, signal) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  try {
    if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
    video.muted = true;
    video.setAttribute("playsinline", "");
    video.srcObject = stream;
    await video.play();
    const detect = await detector();
    while (!signal.aborted) {
      const found = (await detect(video).catch(() => [])).find((t) => accept(t));
      if (found) return found;
      await new Promise((r) => setTimeout(r, 180));
    }
    throw new DOMException("Scan cancelled", "AbortError");
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}
