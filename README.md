# Date Night Deck

A question card game for couples. Take turns drawing a card and answering it, from easy warm-ups to deep questions, would-you-rathers and romantic dares.

## How to play

1. Enter both names and start the game.
2. Draw a card. The card says who answers. Turns switch after every card.
3. Each player gets three passes per game. Out of passes? Take a dare instead.
4. "Would you rather" and "Who's more likely" cards are for both of you at once.
5. Tap the heart to save a card you want to come back to.

## Features

- 10 decks and about 200 cards: Warm up, Our story, Dreams, Deep, Appreciation, Would you rather, Who's more likely, Flirty, Dares, and an opt-in After dark deck
- Write your own cards
- Saved cards, per-player stats and passes
- Remembers your game on the device
- Installable to the home screen and works offline

## Run locally

It's a static site with no build step. Open `index.html`, or serve the folder:

```sh
python3 -m http.server 8000
```

## Adding questions

Edit `questions.js`. Each deck has an `id`, a `name`, a `blurb` and a list of `cards`. Set `both: true` for cards both players answer together.
