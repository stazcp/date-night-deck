(() => {
  const STORE_KEY = "date-night-deck:v1";
  const LINK_KEY = "date-night-deck:link";
  const PASSES = 3;
  const DECKS = window.DECKS;
  const MINE = { id: "mine", name: "Our cards", blurb: "Questions you wrote yourselves" };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // ---------- State ----------
  function freshGame() {
    return { used: [], current: null, isDare: false, turn: 0, answered: [0, 0], passes: [PASSES, PASSES], drawn: 0 };
  }
  function freshState() {
    return {
      names: ["", ""], started: false, adult: false,
      on: DECKS.filter((d) => !d.adult).map((d) => d.id).concat("mine"),
      favs: [], custom: [], game: freshGame()
    };
  }
  let S = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(freshState(), JSON.parse(raw));
    } catch (e) { /* storage unavailable */ }
    return freshState();
  }
  function save() {
    // a guest only mirrors the host's game; its own saved game stays untouched
    if (link.role === "guest") return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
  }

  // ---------- Decks and cards ----------
  const deckById = (id) => (id === "mine" ? MINE : DECKS.find((d) => d.id === id));
  const visibleDecks = () => DECKS.filter((d) => S.adult || !d.adult);
  function cardsOf(deckId) {
    if (deckId === "mine") return S.custom.map((c) => ({ key: "mine|" + c.id, text: c.text }));
    const d = deckById(deckId);
    return d ? d.cards.map((text, i) => ({ key: d.id + "|" + i, text })) : [];
  }
  function cardText(key) {
    const [deckId, id] = key.split("|");
    if (deckId === "mine") { const c = S.custom.find((x) => x.id === id); return c ? c.text : null; }
    const d = deckById(deckId);
    return d ? d.cards[+id] ?? null : null;
  }
  function activeDeckIds() {
    return S.on.filter((id) => {
      const d = deckById(id);
      return d && (id === "mine" ? S.custom.length > 0 : S.adult || !d.adult);
    });
  }
  function pool(deckIds) {
    const used = new Set(S.game.used);
    return deckIds.flatMap(cardsOf).filter((c) => !used.has(c.key));
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const isBoth = () => S.game.current && deckById(S.game.current.split("|")[0])?.both;
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  // ---------- Game rules ----------
  // Every change to the game goes through apply(), so one phone or two play by
  // the same rules. `by` is the player acting (0 or 1), or null when both share
  // one phone. Returns what to tell the players: { toast, shared, decks }.
  // `shared` toasts show on both phones, the rest only on the actor's.
  function draw(deckIds = activeDeckIds(), isDare = false) {
    const g = S.game;
    let p = pool(deckIds), reshuffled = false;
    if (!p.length) {
      const keys = new Set(deckIds.flatMap(cardsOf).map((c) => c.key));
      g.used = g.used.filter((k) => !keys.has(k));
      p = pool(deckIds);
      reshuffled = p.length > 0;
    }
    if (!p.length) return { toast: "Turn on at least one deck", decks: true };
    const c = pick(p);
    g.used.push(c.key);
    g.drawn++;
    g.current = c.key;
    g.isDare = isDare;
    return reshuffled && !isDare ? { toast: "You've seen every card. Reshuffled.", shared: true } : null;
  }

  function apply(a, by) {
    const g = S.game;
    // turn actions carry the card count they were made on, so two taps on the
    // same card from both phones only count once
    const fresh = a.n === g.drawn;
    const myTurn = by == null || isBoth() || by === g.turn;
    switch (a.t) {
      case "draw":
        return g.current ? null : draw();
      case "answered":
        if (!g.current || !fresh || !myTurn) return null;
        if (isBoth()) { g.answered[0]++; g.answered[1]++; } else g.answered[g.turn]++;
        g.turn = 1 - g.turn;
        return draw();
      case "pass": {
        if (!g.current || !fresh || !myTurn || isBoth() || g.passes[g.turn] <= 0) return null;
        g.passes[g.turn]--;
        const msg = `${S.names[g.turn]} passed. ${g.passes[g.turn]} left.`;
        return Object.assign({ toast: msg, shared: true }, draw());
      }
      case "skip":
        return g.current && fresh && isBoth() ? draw() : null;
      case "dare":
        if (!g.current || !fresh || !myTurn || isBoth() || g.isDare || g.passes[g.turn] > 0) return null;
        return draw(["dares"], true);
      case "fav": {
        const key = str(a.key, 80);
        if (!key || !cardText(key)) return null;
        const i = S.favs.indexOf(key);
        if (i >= 0) { S.favs.splice(i, 1); return { toast: "Removed from saved" }; }
        S.favs.push(key);
        return { toast: "Saved. Find it under Saved." };
      }
      case "unfav":
        S.favs = S.favs.filter((k) => k !== a.key);
        return null;
      case "deck":
        if (!deckById(a.id)) return null;
        if (S.on.includes(a.id)) S.on = S.on.filter((x) => x !== a.id); else S.on.push(a.id);
        return null;
      case "newGame":
        S.game = freshGame();
        return { toast: "New game. Passes refilled.", shared: true };
      case "addCard": {
        const text = str(a.text, 200);
        if (!text) return null;
        S.custom.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text });
        if (!S.on.includes("mine")) S.on.push("mine");
        return { toast: "Added to Our cards" };
      }
      case "delCard":
        S.custom = S.custom.filter((c) => c.id !== a.id);
        S.favs = S.favs.filter((k) => k !== "mine|" + a.id);
        return null;
      case "adult":
        S.adult = !S.adult;
        if (S.adult && !S.on.includes("afterdark")) S.on.push("afterdark");
        return { toast: S.adult ? "After dark deck is on" : "After dark deck is off", shared: true };
      case "names":
        if (!Array.isArray(a.names)) return null;
        S.names = [str(a.names[0], 20) || S.names[0], str(a.names[1], 20) || S.names[1]];
        return { toast: "Names saved" };
    }
    return null;
  }

  // run an action from this phone: a guest asks the host, everyone else applies it
  function act(a) {
    if (link.role === "guest") {
      if (!link.connected) return toast("Not connected. Reconnecting…");
      link.send.act(a);
      return;
    }
    commit(apply(a, me()), me());
  }
  function commit(r, by) {
    save();
    render();
    const actorHere = by == null || by === me();
    if (r?.toast && (actorHere || r.shared)) toast(r.toast);
    if (r?.decks && actorHere) openSheet("decks");
    if (link.role === "host") pushState(r && (r.shared || by === 1) ? r : null);
  }

  // ---------- Card animation ----------
  const card = $("card");
  function paintFront(key) {
    const [deckId] = key.split("|");
    const d = deckById(deckId);
    $("cat").textContent = d.name;
    $("q").textContent = cardText(key) ?? "This card was removed. Draw another.";
    const who = $("who");
    const dare = deckId === "dares";
    if (d.both) who.innerHTML = "<b>Both of you</b> answer on three";
    else if (S.game.turn === me()) who.innerHTML = `<b>You</b> ${dare ? "take the dare" : "answer"}`;
    else { who.innerHTML = "<b></b> " + (dare ? "takes the dare" : "answers"); who.querySelector("b").textContent = S.names[S.game.turn]; }
    const fav = S.favs.includes(key);
    $("fav").setAttribute("aria-pressed", fav);
    $("fav").setAttribute("aria-label", fav ? "Remove from saved" : "Save this card");
  }
  function flipTo(key) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (card.classList.contains("flipped") && !reduce) {
      card.classList.add("out");
      setTimeout(() => {
        card.style.transition = "none";
        card.classList.remove("out", "flipped");
        void card.offsetWidth;
        card.style.transition = "";
        if (!S.game.current) return; // a new game started mid-flip
        paintFront(S.game.current);
        requestAnimationFrame(() => card.classList.add("flipped"));
      }, 280);
    } else {
      paintFront(key);
      card.classList.add("flipped");
    }
  }

  // ---------- Rendering ----------
  function renderPlayers() {
    const g = S.game, mine = me();
    $("players").innerHTML = [0, 1].map((i) => {
      const label = mine == null ? (g.turn === i ? "Your turn" : "Up next")
        : mine === i ? (g.turn === i ? "You · your turn" : "You · up next")
        : g.turn === i ? "Their turn" : "Up next";
      return `
      <div class="player ${g.current && !isBoth() && g.turn === i ? "active" : ""} ${g.current && isBoth() ? "active" : ""}">
        <span class="label">${label}</span>
        <span class="name">${esc(S.names[i])}</span>
        <span class="meta"><span>${g.answered[i]} answered</span>
          <span class="passes" aria-label="${g.passes[i]} passes left">${Array.from({ length: PASSES }, (_, k) => `<i class="${k < g.passes[i] ? "" : "used"}"></i>`).join("")}</span>
        </span>
      </div>`;
    }).join("");
  }
  function renderLeft() {
    const n = pool(activeDeckIds()).length;
    $("left").textContent = n ? `${n} card${n === 1 ? "" : "s"} left in your decks` : "Every card seen. The next draw reshuffles.";
  }
  function renderActions() {
    const g = S.game, el = $("actions"), mine = me();
    if (link.role === "guest" && !link.connected) {
      el.innerHTML = `<p class="wait">Reconnecting to ${esc(S.names[0])}'s phone<span class="dots"></span></p>`;
    } else if (!g.current) {
      el.innerHTML = `<button class="btn" data-act="draw">Draw the first card</button>`;
    } else if (isBoth()) {
      el.innerHTML = `<button class="btn" data-act="answered">Done, next card</button><button class="btn ghost" data-act="skip">Skip</button>`;
    } else if (mine != null && g.turn !== mine) {
      el.innerHTML = `<p class="wait">Waiting for <b>${esc(S.names[g.turn])}</b> to ${g.isDare ? "do the dare" : "answer"}<span class="dots"></span></p>`;
    } else {
      const left = g.passes[g.turn];
      const second = left > 0
        ? `<button class="btn ghost" data-act="pass">Pass (${left} left)</button>`
        : g.isDare ? "" : `<button class="btn ghost" data-act="dare">Take a dare instead</button>`;
      el.innerHTML = `<button class="btn" data-act="answered">${g.isDare ? "Dare done" : "Answered"}</button>${second}`;
    }
  }
  function renderPill() {
    const pill = $("link-pill");
    pill.hidden = !link.role;
    if (!link.role) return;
    const partner = S.names[link.role === "host" ? 1 : 0];
    pill.classList.toggle("on", link.connected);
    pill.textContent = link.connected ? `Linked with ${partner}`
      : link.role === "host" && !session?.partner ? `Room ${link.code}` : "Reconnecting…";
  }

  // `shown` is the card on the table, so a re-render only flips when a new card is drawn
  let shown = { key: null, drawn: -1 }, shownAt = 0;
  function render({ animate = true } = {}) {
    const g = S.game;
    if (g.current !== shown.key || g.drawn !== shown.drawn) {
      shownAt = Date.now();
      if (!g.current) card.classList.remove("flipped");
      else if (animate) flipTo(g.current);
      else { paintFront(g.current); card.classList.add("flipped"); }
    } else if (g.current) paintFront(g.current);
    shown = { key: g.current, drawn: g.drawn };
    renderPlayers(); renderActions(); renderLeft(); renderPill();
    if (currentSheet) renderSheet({ keep: true });
  }

  $("actions").addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]")?.dataset.act;
    if (!t) return;
    // a tap that lands just as the partner's tap brings a new card was meant
    // for the old card, not the one nobody has read yet
    if (t !== "draw" && Date.now() - shownAt < 700) return;
    act({ t, n: S.game.drawn });
  });
  $("fav").addEventListener("click", () => { if (S.game.current) act({ t: "fav", key: S.game.current }); });
  $("link-pill").addEventListener("click", () => openSheet("link"));

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- Sheets ----------
  let lastFocus = null, currentSheet = null;
  function openSheet(name) {
    if (currentSheet === name) return;
    if (!currentSheet) lastFocus = document.activeElement;
    currentSheet = name;
    renderSheet();
    $("sheet-wrap").hidden = false;
    $("sheet").querySelector("[data-close]").focus();
  }
  function closeSheet() {
    $("sheet-wrap").hidden = true; currentSheet = null;
    renderLeft(); renderActions();
    lastFocus?.focus?.();
  }
  document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openSheet(b.dataset.open)));
  $("sheet-wrap").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && currentSheet) closeSheet(); });

  // Re-rendering an open sheet (say, when the partner's phone changes something)
  // keeps whatever was typed into its fields and which control had focus.
  function sheetSnapshot() {
    const body = $("sheet-body"), typed = {};
    body.querySelectorAll("input[id], textarea[id]").forEach((f) => { if (f.value !== f.defaultValue) typed[f.id] = f.value; });
    const a = document.activeElement, focus = body.contains(a)
      ? a.id ? "#" + a.id : a.dataset.deck ? `[data-deck="${a.dataset.deck}"]` : null : null;
    return { typed, focus, scroll: body.scrollTop };
  }
  function sheetRestore({ typed, focus, scroll }) {
    const body = $("sheet-body");
    for (const [id, v] of Object.entries(typed)) { const f = body.querySelector("#" + id); if (f) f.value = v; }
    if (focus) body.querySelector(focus)?.focus();
    body.scrollTop = scroll;
  }

  function renderSheet({ keep = false } = {}) {
    const snap = keep ? sheetSnapshot() : null;
    const body = $("sheet-body"), title = $("sheet-title");
    if (currentSheet === "decks") {
      title.textContent = "Choose decks";
      const decks = visibleDecks().concat(MINE);
      body.innerHTML = `<p>Cards are drawn at random from every deck you turn on.</p>` + decks.map((d) => {
        const total = cardsOf(d.id).length, on = S.on.includes(d.id);
        const disabled = d.id === "mine" && !total;
        return `<button class="deck-row" role="switch" aria-checked="${on && !disabled}" data-deck="${d.id}" ${disabled ? "disabled" : ""}>
          <span class="info"><b>${esc(d.name)}</b><span>${esc(disabled ? "Add your own cards under More" : d.blurb)}</span></span>
          <span class="count">${total}</span><span class="switch" aria-hidden="true"></span></button>`;
      }).join("") + (S.adult ? "" : `<p>Looking for something spicier? Turn on <b>After dark</b> under More.</p>`);
      body.querySelectorAll("[data-deck]").forEach((b) => b.addEventListener("click", () => act({ t: "deck", id: b.dataset.deck })));
    } else if (currentSheet === "favs") {
      title.textContent = "Saved cards";
      const items = S.favs.map((k) => ({ k, text: cardText(k), deck: deckById(k.split("|")[0]) })).filter((x) => x.text);
      body.innerHTML = items.length
        ? `<p>Tap the heart on any card to save it here.</p><ul class="list">${items.map((x) => `<li><div><small>${esc(x.deck.name)}</small><span>${esc(x.text)}</span></div><button data-unfav="${esc(x.k)}">Remove</button></li>`).join("")}</ul>`
        : `<p class="empty">No saved cards yet. Tap the heart on a card you want to come back to.</p>`;
      body.querySelectorAll("[data-unfav]").forEach((b) => b.addEventListener("click", () => act({ t: "unfav", key: b.dataset.unfav })));
    } else if (currentSheet === "more") {
      title.textContent = "More";
      const g = S.game;
      body.innerHTML = `
        <h3>This game</h3>
        <div class="stats">
          <div class="stat"><b>${g.answered[0]}</b><span>${esc(S.names[0])} answered</span></div>
          <div class="stat"><b>${g.answered[1]}</b><span>${esc(S.names[1])} answered</span></div>
        </div>
        <div class="row"><button class="btn small" id="new-game">Start a new game</button></div>

        <h3>Two phones</h3>
        ${link.role
          ? `<p>${esc(linkStatus())}</p><div class="row"><button class="btn small ghost" id="manage-link">Manage</button></div>`
          : `<p>Play on separate phones. Cards, turns and passes stay in sync.</p>
             <div class="row"><button class="btn small ghost" id="more-host">Host a game</button><button class="btn small ghost" id="more-join">Join a game</button></div>`}

        <h3>Write your own card</h3>
        <form id="add-form" class="fields">
          <label for="new-card">Your question or dare</label>
          <textarea id="new-card" maxlength="200" placeholder="What's something you'd love us to do this summer?"></textarea>
          <div class="row"><button class="btn small" type="submit">Add to Our cards</button></div>
        </form>
        ${S.custom.length ? `<ul class="list">${S.custom.map((c) => `<li><div><span>${esc(c.text)}</span></div><button data-del="${esc(c.id)}">Delete</button></li>`).join("")}</ul>` : ""}

        <h3>Settings</h3>
        <button class="deck-row" role="switch" id="adult" aria-checked="${S.adult}">
          <span class="info"><b>After dark deck</b><span>Romantic, suggestive questions for adults</span></span>
          <span class="switch" aria-hidden="true"></span></button>
        <form id="names-form" class="fields">
          <label for="e1">Player one</label><input id="e1" maxlength="20" value="${esc(S.names[0])}">
          <label for="e2">Player two</label><input id="e2" maxlength="20" value="${esc(S.names[1])}">
          <div class="row"><button class="btn small ghost" type="submit">Save names</button></div>
        </form>
        ${link.role ? "" : `<div class="row"><button class="btn small danger" id="reset">Erase everything</button></div>
        <p id="reset-confirm" hidden>This deletes your names, saved cards and your own cards from this device. <button class="btn small danger" id="reset-yes">Yes, erase</button></p>`}
        <p>Tip: add this page to your home screen to open it like an app. It works offline after the first visit.</p>`;

      $("new-game").onclick = () => { act({ t: "newGame" }); closeSheet(); };
      if (link.role) $("manage-link").onclick = () => openSheet("link");
      else {
        $("more-host").onclick = () => { closeSheet(); showLink("host"); };
        $("more-join").onclick = () => { closeSheet(); showLink("join"); };
      }
      $("add-form").onsubmit = (e) => {
        e.preventDefault();
        const text = $("new-card").value.trim(); if (!text) return;
        $("new-card").value = "";
        act({ t: "addCard", text });
      };
      body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => act({ t: "delCard", id: b.dataset.del })));
      $("adult").onclick = () => act({ t: "adult" });
      $("names-form").onsubmit = (e) => {
        e.preventDefault();
        act({ t: "names", names: [$("e1").value, $("e2").value] });
      };
      if (!link.role) {
        $("reset").onclick = () => { $("reset-confirm").hidden = false; };
        $("reset-yes").onclick = () => {
          try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
          S = freshState(); closeSheet(); showSetup();
        };
      }
    } else if (currentSheet === "link") {
      title.textContent = "Two phones";
      const host = link.role === "host";
      if (!link.role) { body.innerHTML = `<p>This phone isn't linked to another one.</p>`; return; }
      body.innerHTML = `
        <p>${esc(linkStatus())}</p>
        <div class="code-box"><span class="label">Room code</span><span class="code">${esc(link.code)}</span></div>
        ${host ? `<div class="row"><button class="btn small" id="share">Share invite link</button></div>` : ""}
        <p>${host ? "You're the host. This phone keeps the game: decks, saved cards and your own cards come from here." : "The host's phone keeps the game. Your own saved game on this phone is untouched."}</p>
        <div class="row"><button class="btn small danger" id="unlink">${host ? "End two-phone game" : "Leave game"}</button></div>`;
      if (host) $("share").onclick = shareInvite;
      $("unlink").onclick = () => { closeSheet(); endLink({ notify: true }); };
    }
    if (snap) sheetRestore(snap);
  }

  // ---------- Two phones ----------
  // Peer-to-peer over WebRTC with Trystero: public Nostr relays only introduce
  // the phones, then cards travel directly between them, end-to-end encrypted.
  // The host's phone owns the game and applies every action; the guest sends
  // its taps to the host and shows whatever state comes back.
  const APP_ID = "staz.ai/date-night-deck";
  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const PROTOCOL = 1;
  // both phones look cards up by deck and index, so they must have the same decks
  const DECKS_VERSION = (() => {
    let h = 2166136261;
    for (const ch of JSON.stringify(DECKS)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return (h >>> 0).toString(36);
  })();
  const link = { role: null, code: null, room: null, peer: null, connected: false, send: {} };
  let session = readSession();
  let p2p = null;
  const loadP2P = () => (p2p ||= import("./vendor/trystero-nostr.js").catch((e) => { p2p = null; throw e; }));

  function readSession() {
    try { return JSON.parse(localStorage.getItem(LINK_KEY)) || null; } catch (e) { return null; }
  }
  function writeSession(s) {
    session = s;
    try { s ? localStorage.setItem(LINK_KEY, JSON.stringify(s)) : localStorage.removeItem(LINK_KEY); } catch (e) { /* storage unavailable */ }
  }
  const me = () => (link.role === "host" ? 0 : link.role === "guest" ? 1 : null);
  const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const randomHex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
  function newCode() {
    const r = crypto.getRandomValues(new Uint8Array(6));
    return Array.from(r, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
  }
  const inviteUrl = () => `${location.origin}${location.pathname}?join=${link.code}`;
  function linkStatus() {
    const partner = S.names[link.role === "host" ? 1 : 0];
    if (link.connected) return `Linked with ${partner}'s phone.`;
    if (link.role === "host") return session?.partner ? `${partner}'s phone is offline. It reconnects on its own.` : `Waiting for your partner to join with code ${link.code}.`;
    return `Reconnecting to ${partner}'s phone…`;
  }
  function snapshot() {
    const { names, adult, on, favs, custom, game } = S;
    return { names, adult, on, favs, custom, game };
  }
  // a guest renders whatever the host sends, so only keep well-formed values
  function cleanSnapshot(s) {
    const strs = (a, max) => (Array.isArray(a) ? a.filter((x) => typeof x === "string").map((x) => x.slice(0, max)) : []);
    const int = (v, lo, hi) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : lo);
    const g = s.game || {}, out = freshState();
    out.names = [0, 1].map((i) => str(s.names?.[i], 20) || `Player ${i ? "two" : "one"}`);
    out.adult = s.adult === true;
    out.custom = (Array.isArray(s.custom) ? s.custom : [])
      .filter((c) => c && typeof c.id === "string" && typeof c.text === "string")
      .map((c) => ({ id: c.id.slice(0, 20), text: c.text.slice(0, 200) }));
    S = out; // cardText() below reads the custom cards
    out.on = strs(s.on, 20).filter((id) => deckById(id));
    out.favs = strs(s.favs, 80).filter((k) => cardText(k));
    out.game = {
      used: strs(g.used, 80),
      // a deleted custom card stays on the table ("This card was removed") until answered
      current: typeof g.current === "string" && deckById(g.current.split("|")[0]) ? g.current.slice(0, 80) : null,
      isDare: g.isDare === true,
      turn: int(g.turn, 0, 1),
      answered: [0, 1].map((i) => int(g.answered?.[i], 0, 1e6)),
      passes: [0, 1].map((i) => int(g.passes?.[i], 0, PASSES)),
      drawn: int(g.drawn, 0, 1e9)
    };
    out.started = true;
    return out;
  }
  function pushState(r) {
    if (!link.connected) return;
    link.send.state({ s: snapshot(), key: session.key, toast: r?.toast, decks: !!r?.decks }, { target: link.peer });
  }

  async function connect() {
    const { role, code } = link;
    const { joinRoom } = await loadP2P();
    // cancelled (or restarted) while the library loaded
    if (link.role !== role || link.code !== code || link.room) return;
    const room = joinRoom({ appId: APP_ID, password: link.code }, "room-" + link.code, {
      onJoinError: (d) => console.warn("date-night-deck: peer connection failed", d.error)
    });
    link.room = room;
    // events can still trickle in from a room this phone has already left
    const live = () => link.room === room && session;
    const hello = room.makeAction("hello"), state = room.makeAction("state"),
      actA = room.makeAction("act"), bye = room.makeAction("bye"), full = room.makeAction("full");
    link.send = {
      state: (d, o) => state.send(d, o),
      act: (d) => actA.send(d, { target: link.peer }),
      bye: () => bye.send({}, { target: link.peer })
    };

    if (link.role === "host") {
      hello.onMessage = (d, { peerId }) => {
        if (!live()) return;
        const token = str(d?.token, 40), name = str(d?.name, 20) || "Player two";
        if (!token) return;
        if (d.v !== PROTOCOL || d.decks !== DECKS_VERSION) return full.send({ reason: "version" }, { target: peerId });
        // one partner at a time; the same phone (same token) may always come back
        if (link.connected && link.peer !== peerId && token !== session.partner) return full.send({ reason: "full" }, { target: peerId });
        const isNew = token !== session.partner;
        link.peer = peerId; link.connected = true;
        writeSession({ ...session, partner: token });
        // a returning phone keeps whatever name it has in the game now
        if (isNew) S.names[1] = name;
        S.started = true;
        if (isNew) S.game = freshGame();
        save();
        hideLink(); showApp();
        pushState(null);
        toast(isNew ? `${name} joined` : `${S.names[1]} is back`);
      };
      actA.onMessage = (a, { peerId }) => {
        if (!live()) return;
        if (peerId !== link.peer || !a || typeof a.t !== "string") return;
        commit(apply(a, 1), 1);
      };
      bye.onMessage = (_, { peerId }) => {
        if (!live()) return;
        if (peerId !== link.peer) return;
        toast(`${S.names[1]} left the game`);
        link.peer = null; link.connected = false;
        writeSession({ ...session, partner: null });
        render();
      };
      room.onPeerLeave = (peerId) => {
        if (!live()) return;
        if (peerId !== link.peer) return;
        link.connected = false;
        render();
      };
    } else {
      // greet every phone in the room; only the host answers
      room.onPeerJoin = (peerId) => live() && hello.send({ v: PROTOCOL, decks: DECKS_VERSION, token: session.token, name: session.name }, { target: peerId });
      state.onMessage = (d, { peerId }) => {
        if (!live()) return;
        if (!d?.s || typeof d.s !== "object") return;
        // trust the first host this phone links with, then only a phone holding
        // its key (sent over the encrypted channel) — survives the host reloading
        const key = str(d.key, 40);
        if (!key || (session.hostKey && key !== session.hostKey)) return;
        if (!session.hostKey) writeSession({ ...session, hostKey: key });
        const first = !link.connected;
        link.peer = peerId; link.connected = true;
        S = cleanSnapshot(d.s);
        // reconnect under the latest name, in case it was changed in game
        if (session.name !== S.names[1]) writeSession({ ...session, name: S.names[1] });
        if (first) { hideLink(); showApp({ animate: false }); } else render();
        if (d.toast) toast(d.toast);
        if (d.decks) openSheet("decks");
      };
      bye.onMessage = (_, { peerId }) => {
        if (!live()) return;
        if (peerId !== link.peer) return;
        const host = S.names[0];
        endLink({ notify: false });
        toast(`${host} ended the two-phone game`);
      };
      full.onMessage = (d) => {
        if (!live()) return;
        // a version mismatch always counts (the host may have reloaded onto new
        // decks); "full" only turns away a phone that isn't in the game yet
        if (link.connected && d?.reason !== "version") return;
        endLink({ notify: false });
        showLink("error", d?.reason === "version"
          ? "Your phones are on different versions of the game. Reload the page on both and try again."
          : "That game already has two players.");
      };
      room.onPeerLeave = (peerId) => {
        if (!live()) return;
        if (peerId !== link.peer) return;
        link.connected = false;
        render();
      };
    }
  }

  async function startLink(role, code, name) {
    link.role = role; link.code = code; link.peer = null; link.connected = false;
    try {
      await connect();
    } catch (e) {
      console.warn("date-night-deck: couldn't load two-phone mode", e);
      if (link.role !== role || link.code !== code) return false;
      endLink({ notify: false });
      showLink("error", "Couldn't start two-phone mode. It needs an internet connection.");
      return false;
    }
    return true;
  }

  async function host(name) {
    const code = newCode();
    S.names[0] = name;
    writeSession({ role: "host", code, partner: null, key: randomHex(12) });
    link.role = "host"; save();
    showLink("hosting", null, code);
    await startLink("host", code);
  }
  async function join(code, name) {
    const same = session?.role === "guest" && session.code === code;
    writeSession({ role: "guest", code, name, token: same ? session.token : randomHex(12), hostKey: same ? session.hostKey : undefined });
    showLink("joining", null, code);
    await startLink("guest", code);
  }

  async function endLink({ notify }) {
    const { room, role, connected } = link;
    if (notify && connected) { try { await link.send.bye(); } catch (e) { /* already gone */ } }
    try { room?.leave(); } catch (e) { /* ignore */ }
    Object.assign(link, { role: null, code: null, room: null, peer: null, connected: false, send: {} });
    writeSession(null);
    if (currentSheet) closeSheet();
    hideLink();
    if (role === "guest") S = load();
    if (S.started) showApp({ animate: false }); else showSetup();
  }

  async function shareInvite() {
    const url = inviteUrl();
    if (navigator.share) {
      try { await navigator.share({ title: "Date Night Deck", text: `Join my Date Night Deck game. Room code ${link.code}.`, url }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); toast("Invite link copied"); }
    catch (e) { toast(`Share the room code: ${link.code}`); }
  }

  // ---------- Two-phone screens ----------
  let joinHint;
  function showLink(view, msg, code) {
    $("setup").hidden = true;
    $("link").hidden = false;
    clearTimeout(joinHint);
    const p = $("link-panel"), logo = `<div class="logo small" aria-hidden="true"><span>D<i>&amp;</i>N</span></div>`;
    const back = `<button type="button" class="btn ghost small" data-link-back>Back</button>`;
    if (view === "host") {
      p.innerHTML = `${logo}<h2>Host a game</h2>
        <p>You'll get a room code to share. Your partner joins from their own phone.</p>
        <form class="fields" id="host-form"><label for="host-name">Your name</label>
          <input id="host-name" autocomplete="off" maxlength="20" placeholder="Your name" value="${esc(S.names[0])}" required></form>
        <button class="btn" type="submit" form="host-form">Create a room</button>${back}`;
      $("host-form").onsubmit = (e) => { e.preventDefault(); const n = str($("host-name").value, 20); if (n) host(n); };
    } else if (view === "join") {
      p.innerHTML = `${logo}<h2>Join a game</h2>
        <p>Enter the room code from your partner's phone.</p>
        <form class="fields" id="join-form">
          <label for="join-code">Room code</label>
          <input id="join-code" class="code-input" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="7" placeholder="ABC123" value="${esc(code || "")}" required>
          <label for="join-name">Your name</label>
          <input id="join-name" autocomplete="off" maxlength="20" placeholder="Your name" value="${esc(session?.name || S.names[0])}" required></form>
        <button class="btn" type="submit" form="join-form">Join</button>${back}`;
      $("join-form").onsubmit = (e) => {
        e.preventDefault();
        const c = normCode($("join-code").value), n = str($("join-name").value, 20);
        if (c.length !== 6) return toast("Room codes have 6 letters and numbers");
        if (n) join(c, n);
      };
    } else if (view === "hosting") {
      p.innerHTML = `<h2>Your room code</h2>
        <div class="code-box"><span class="code">${esc(code)}</span></div>
        <button class="btn" type="button" id="share">Share invite link</button>
        <p class="wait">Waiting for your partner to join<span class="dots"></span></p>
        <p class="fine">Both phones need the internet to connect. After that, cards and turns stay in sync.</p>
        <button type="button" class="btn ghost small" id="cancel-link">Cancel</button>`;
      $("share").onclick = shareInvite;
    } else if (view === "joining") {
      p.innerHTML = `<h2>Joining ${esc(code)}</h2>
        <p class="wait">Looking for your partner's phone<span class="dots"></span></p>
        <p class="fine" id="join-hint" hidden>Still looking. Make sure the game is open on their phone with the same code.</p>
        <button type="button" class="btn ghost small" id="cancel-link">Cancel</button>`;
      joinHint = setTimeout(() => { const h = $("join-hint"); if (h) h.hidden = false; }, 15000);
    } else if (view === "error") {
      p.innerHTML = `${logo}<h2>Couldn't connect</h2><p>${esc(msg)}</p>${back}`;
    }
    p.querySelector("[data-link-back]")?.addEventListener("click", () => { hideLink(); if (S.started) showApp({ animate: false }); else showSetup(); });
    p.querySelector("#cancel-link")?.addEventListener("click", () => endLink({ notify: false }));
    (p.querySelector("input:not([value]), input[value='']") || p.querySelector("input, button"))?.focus();
  }
  function hideLink() { $("link").hidden = true; clearTimeout(joinHint); }
  document.querySelectorAll("[data-link]").forEach((b) => b.addEventListener("click", () => showLink(b.dataset.link)));

  // ---------- Setup ----------
  function showSetup() {
    $("app").hidden = true; $("setup").hidden = false;
    $("n1").value = S.names[0]; $("n2").value = S.names[1];
  }
  function showApp({ animate = false } = {}) {
    $("setup").hidden = true; $("app").hidden = false;
    shown = { key: null, drawn: -1 };
    render({ animate });
  }
  $("setup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    S.names = [$("n1").value.trim() || "Player one", $("n2").value.trim() || "Player two"];
    S.started = true; S.game = freshGame(); save(); showApp();
  });

  // ---------- Start ----------
  const joinParam = normCode(new URLSearchParams(location.search).get("join"));
  if (joinParam) history.replaceState(null, "", location.pathname);

  if (joinParam && !(session?.role === "guest" && session.code === joinParam)) {
    // an invite link: ask for a name first (ending any two-phone game this phone was in)
    if (session) writeSession(null);
    if (S.started) showApp(); else showSetup();
    showLink("join", null, joinParam);
  } else if (session?.role === "guest") {
    showLink("joining", null, session.code);
    startLink("guest", session.code);
  } else if (session?.role === "host") {
    link.role = "host"; link.code = session.code;
    if (session.partner && S.started) showApp(); else showLink("hosting", null, session.code);
    startLink("host", session.code);
  } else if (S.started) showApp(); else showSetup();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
