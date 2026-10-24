# Liar’s Bar Lite

A small multiplayer bluffing game (2 to 4 players). The server deals and referees, so nobody, including the host, can see another player’s cards.

## Run locally
    npm install
    npm start
Open http://localhost:3000 in two or more browser tabs.

## Deploy free on Render
1. Put this folder in a GitHub repo.
2. On render.com, create a **Web Service** from the repo.
3. Build command: `npm install`  Start command: `npm start`  Plan: Free.
4. Share the Render URL with friends. The free plan sleeps when idle, so the first load can take 30+ seconds.

## Rules
- Deck: 6 Kings, 6 Queens, 6 Aces, 2 Jokers (wild). Everyone gets 5 cards.
- Each round has a table card (Kings, Queens or Aces).
- On your turn, play 1 to 3 cards face down, claiming they match the table card, or call the previous player a liar.
- On a call, the cards are revealed. If any card is not the table card or a joker, the liar spins. Otherwise the caller spins.
- Spin: each player has a 6-chamber gun with 1 bullet. Pulls accumulate across rounds, so risk climbs.
- If your hand is empty on your turn, you must call liar.
- Last player alive wins.

## Limits of this first version
- No reconnecting: if someone leaves mid-game they are out and the round is redealt.
- Rooms live in server memory and reset when the server restarts.
