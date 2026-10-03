(() => {
  const STORE_KEY = "date-night-deck:v1";
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

  // ---------- Game actions ----------
  function drawFrom(deckIds, { reshuffleMsg } = {}) {
    let p = pool(deckIds);
    if (!p.length) {
      const keys = new Set(deckIds.flatMap(cardsOf).map((c) => c.key));
      S.game.used = S.game.used.filter((k) => !keys.has(k));
      p = pool(deckIds);
      if (p.length && reshuffleMsg) toast(reshuffleMsg);
    }
    if (!p.length) return null;
    const c = pick(p);
    S.game.used.push(c.key);
    S.game.drawn++;
    return c.key;
  }
  function next(key, isDare = false) {
    if (!key) { toast("Turn on at least one deck"); openSheet("decks"); return; }
    S.game.current = key;
    S.game.isDare = isDare;
    save();
    flipTo(key);
    renderPlayers(); renderActions(); renderLeft();
  }
  function drawNormal() { next(drawFrom(activeDeckIds(), { reshuffleMsg: "You've seen every card. Reshuffled." })); }
  const isBoth = () => S.game.current && deckById(S.game.current.split("|")[0])?.both;

  function answered() {
    const g = S.game;
    if (isBoth()) { g.answered[0]++; g.answered[1]++; } else g.answered[g.turn]++;
    g.turn = 1 - g.turn;
    drawNormal();
  }
  function pass() {
    if (S.game.passes[S.game.turn] <= 0) return;
    S.game.passes[S.game.turn]--;
    toast(`${S.names[S.game.turn]} passed. ${S.game.passes[S.game.turn]} left.`);
    drawNormal();
  }
  function skipBoth() { drawNormal(); }
  function takeDare() { next(drawFrom(["dares"]), true); }

  // ---------- Card animation ----------
  const card = $("card");
  function paintFront(key) {
    const [deckId] = key.split("|");
    const d = deckById(deckId);
    $("cat").textContent = d.name;
    $("q").textContent = cardText(key) ?? "This card was removed. Draw another.";
    const who = $("who");
    if (d.both) who.innerHTML = "<b>Both of you</b> answer on three";
    else { who.innerHTML = "<b></b> " + (deckId === "dares" ? "takes the dare" : "answers"); who.querySelector("b").textContent = S.names[S.game.turn]; }
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
        paintFront(key);
        requestAnimationFrame(() => card.classList.add("flipped"));
      }, 280);
    } else {
      paintFront(key);
      card.classList.add("flipped");
    }
  }

  // ---------- Rendering ----------
  function renderPlayers() {
    const g = S.game;
    $("players").innerHTML = [0, 1].map((i) => `
      <div class="player ${g.current && !isBoth() && g.turn === i ? "active" : ""} ${g.current && isBoth() ? "active" : ""}">
        <span class="label">${g.turn === i ? "Your turn" : "Up next"}</span>
        <span class="name">${esc(S.names[i])}</span>
        <span class="meta"><span>${g.answered[i]} answered</span>
          <span class="passes" aria-label="${g.passes[i]} passes left">${Array.from({ length: PASSES }, (_, k) => `<i class="${k < g.passes[i] ? "" : "used"}"></i>`).join("")}</span>
        </span>
      </div>`).join("");
  }
  function renderLeft() {
    const n = pool(activeDeckIds()).length;
    $("left").textContent = n ? `${n} card${n === 1 ? "" : "s"} left in your decks` : "Every card seen. The next draw reshuffles.";
  }
  function renderActions() {
    const g = S.game, el = $("actions");
    if (!g.current) {
      el.innerHTML = `<button class="btn" data-act="draw">Draw the first card</button>`;
    } else if (isBoth()) {
      el.innerHTML = `<button class="btn" data-act="answered">Done, next card</button><button class="btn ghost" data-act="skip">Skip</button>`;
    } else {
      const left = g.passes[g.turn];
      const second = left > 0
        ? `<button class="btn ghost" data-act="pass">Pass (${left} left)</button>`
        : g.isDare ? "" : `<button class="btn ghost" data-act="dare">Take a dare instead</button>`;
      el.innerHTML = `<button class="btn" data-act="answered">${g.isDare ? "Dare done" : "Answered"}</button>${second}`;
    }
  }
  function renderAll() {
    renderPlayers(); renderActions(); renderLeft();
    if (S.game.current) { paintFront(S.game.current); card.classList.add("flipped"); }
    else card.classList.remove("flipped");
  }

  $("actions").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "draw") drawNormal();
    else if (act === "answered") answered();
    else if (act === "pass") pass();
    else if (act === "skip") skipBoth();
    else if (act === "dare") takeDare();
  });

  $("fav").addEventListener("click", () => {
    const k = S.game.current; if (!k) return;
    const i = S.favs.indexOf(k);
    if (i >= 0) { S.favs.splice(i, 1); toast("Removed from saved"); }
    else { S.favs.push(k); toast("Saved. Find it under Saved."); }
    save(); paintFront(k);
  });

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
    lastFocus = document.activeElement; currentSheet = name;
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

  function renderSheet() {
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
      body.querySelectorAll("[data-deck]").forEach((b) => b.addEventListener("click", () => {
        const id = b.dataset.deck;
        if (S.on.includes(id)) S.on = S.on.filter((x) => x !== id); else S.on.push(id);
        save(); renderSheet();
      }));
    } else if (currentSheet === "favs") {
      title.textContent = "Saved cards";
      const items = S.favs.map((k) => ({ k, text: cardText(k), deck: deckById(k.split("|")[0]) })).filter((x) => x.text);
      body.innerHTML = items.length
        ? `<p>Tap the heart on any card to save it here.</p><ul class="list">${items.map((x) => `<li><div><small>${esc(x.deck.name)}</small><span>${esc(x.text)}</span></div><button data-unfav="${esc(x.k)}">Remove</button></li>`).join("")}</ul>`
        : `<p class="empty">No saved cards yet. Tap the heart on a card you want to come back to.</p>`;
      body.querySelectorAll("[data-unfav]").forEach((b) => b.addEventListener("click", () => {
        S.favs = S.favs.filter((k) => k !== b.dataset.unfav); save(); renderSheet();
        if (S.game.current) paintFront(S.game.current);
      }));
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
        <div class="row"><button class="btn small danger" id="reset">Erase everything</button></div>
        <p id="reset-confirm" hidden>This deletes your names, saved cards and your own cards from this device. <button class="btn small danger" id="reset-yes">Yes, erase</button></p>
        <p>Tip: add this page to your home screen to open it like an app. It works offline after the first visit.</p>`;

      $("new-game").onclick = () => { S.game = freshGame(); save(); closeSheet(); renderAll(); toast("New game. Passes refilled."); };
      $("add-form").onsubmit = (e) => {
        e.preventDefault();
        const text = $("new-card").value.trim(); if (!text) return;
        S.custom.push({ id: Date.now().toString(36), text });
        if (!S.on.includes("mine")) S.on.push("mine");
        save(); renderSheet(); toast("Added to Our cards");
      };
      body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
        S.custom = S.custom.filter((c) => c.id !== b.dataset.del);
        S.favs = S.favs.filter((k) => k !== "mine|" + b.dataset.del);
        save(); renderSheet();
      }));
      $("adult").onclick = () => {
        S.adult = !S.adult;
        if (S.adult && !S.on.includes("afterdark")) S.on.push("afterdark");
        save(); renderSheet(); toast(S.adult ? "After dark deck is on" : "After dark deck is off");
      };
      $("names-form").onsubmit = (e) => {
        e.preventDefault();
        S.names = [$("e1").value.trim() || S.names[0], $("e2").value.trim() || S.names[1]];
        save(); renderPlayers(); if (S.game.current) paintFront(S.game.current); toast("Names saved");
      };
      $("reset").onclick = () => { $("reset-confirm").hidden = false; };
      $("reset-yes").onclick = () => {
        try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
        S = freshState(); closeSheet(); showSetup();
      };
    }
  }

  // ---------- Setup ----------
  function showSetup() {
    $("app").hidden = true; $("setup").hidden = false;
    $("n1").value = S.names[0]; $("n2").value = S.names[1];
  }
  function showApp() {
    $("setup").hidden = true; $("app").hidden = false;
    renderAll();
  }
  $("setup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    S.names = [$("n1").value.trim() || "Player one", $("n2").value.trim() || "Player two"];
    S.started = true; S.game = freshGame(); save(); showApp();
  });

  if (S.started) showApp(); else showSetup();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
