# Date Night Deck

A question card game for couples. Take turns drawing a card and answering it, from easy warm-ups to deep questions, would-you-rathers and romantic dares.

**Play it at [staz.ai/games/date-night-deck](https://staz.ai/games/date-night-deck/).**

## How to play

1. Enter both names and start the game.
2. Draw a card. The card says who answers. Turns switch after every card.
3. Each player gets three passes per game. Out of passes? Take a dare instead.
4. "Would you rather" and "Who's more likely" cards are for both of you at once.
5. Tap the heart to save a card you want to come back to.

### On two phones

1. One of you taps **Host a game**. Your partner scans the QR code with their camera, or you share the room code or invite link.
2. The other taps **Join a game** (or opens the link) and enters the code.
3. Each phone shows whose turn it is. Only the player whose turn it is can answer or pass, and either of you can tap "Done" on a both-of-you card.

**No internet?** Tap **Pair on the same Wi-Fi** instead. Both phones need to be on the same Wi-Fi, or one on the other's hotspot. The host's phone shows a code, the partner scans it with the in-game scanner and shows a code back, and the host scans that. If the connection drops, tap **Pair again** to carry on the same game.

The host's phone keeps the game: decks, saved cards and your own cards come from there, and the guest's own saved game is left alone. If a phone drops or reloads, it reconnects to the same game.

## Features

- 10 decks and about 200 cards: Warm up, Our story, Dreams, Deep, Appreciation, Would you rather, Who's more likely, Flirty, Dares, and an opt-in After dark deck
- Write your own cards
- Saved cards, per-player stats and passes
- Remembers your game on the device
- Play on one shared phone or on two phones
- Installable to the home screen and works offline

## Run locally

It's a static site with no build step. Open `index.html`, or serve the folder:

```sh
python3 -m http.server 8000
```

## How two-phone mode works

[Trystero](https://github.com/dmotz/trystero) connects the phones directly over WebRTC. Public Nostr relays only introduce them to each other; cards and turns travel phone to phone, end-to-end encrypted. There's no server and nothing to pay for. Both phones need the internet to connect, and a few strict networks (some mobile carriers, VPNs) block direct connections.

The host applies every action through the same `apply()` rules as single-phone play and sends the guest the full game state after each change. `vendor/trystero-nostr.js` is a bundled copy of Trystero, loaded only when you start a two-phone game; the file header says how to rebuild it. `vendor/qrcode.js` (qrcode-generator) draws the invite QR code the same way.

Wi-Fi pairing (`pair.js`) skips the relays: the two QR codes carry just what WebRTC needs (ICE credentials, the DTLS fingerprint and local addresses), and each phone rebuilds a full session description from them. It then uses the same game protocol as online play. Scanning uses the browser's BarcodeDetector where available, and falls back to a bundled copy of jsQR (`vendor/jsqr.js`, Apache-2.0) elsewhere, such as on iOS Safari.

## Adding questions

Edit `questions.js`. Each deck has an `id`, a `name`, a `blurb` and a list of `cards`. Set `both: true` for cards both players answer together.

## Deploying

The game is hosted on [staz.ai](https://staz.ai/games/date-night-deck/). The site copies this repo's files at build time, and pushing to `main` triggers a redeploy (see `.github/workflows/redeploy-staz-ai.yml`). Markdown and dotfiles aren't served.
