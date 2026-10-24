const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(__dirname + '/public'));

const rooms = {};
const TABLE_CARDS = ['K', 'Q', 'A'];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const newCode = () => {
  let c;
  do { c = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join(''); }
  while (rooms[c]);
  return c;
};
const makePlayer = (id, name) => ({ id, name, hand: [], alive: true, gone: false, bullet: 0, pulls: 0 });
const nextAlive = (r, from) => {
  let i = from;
  do { i = (i + 1) % r.players.length; } while (!r.players[i].alive);
  return i;
};

// The server is the dealer: each player only ever receives their own hand.
function view(r, id) {
  const me = r.players.find((p) => p.id === id);
  return {
    code: r.code,
    phase: r.phase,
    isHost: r.hostId === id,
    youIdx: r.players.indexOf(me),
    players: r.players.map((p) => ({ name: p.name, cards: p.hand.length, alive: p.alive, pulls: p.pulls })),
    hand: me ? me.hand : [],
    table: r.table,
    turn: r.turn,
    last: r.last ? { by: r.last.by, count: r.last.cards.length } : null,
    reveal: r.reveal,
    winner: r.phase === 'over' ? r.players.findIndex((p) => p.alive) : -1,
  };
}
function broadcast(r) {
  r.players.filter((p) => !p.gone).forEach((p) => io.to(p.id).emit('state', view(r, p.id)));
}

function startRound(r, starter) {
  const alive = r.players.filter((p) => p.alive);
  if (alive.length <= 1) { r.phase = 'over'; return; }
  const deck = shuffle([...Array(6).fill('K'), ...Array(6).fill('Q'), ...Array(6).fill('A'), 'J', 'J']);
  r.players.forEach((p) => { p.hand = p.alive ? deck.splice(0, 5) : []; });
  r.table = TABLE_CARDS[Math.floor(Math.random() * 3)];
  r.turn = r.players[starter].alive ? starter : nextAlive(r, starter);
  r.last = null;
  r.reveal = null;
  r.phase = 'playing';
}

io.on('connection', (socket) => {
  let code = null;
  const room = () => (code && rooms[code]) || null;
  const cleanName = (n) => String(n || '').trim().slice(0, 14) || 'Player';

  socket.on('create', (name, cb) => {
    code = newCode();
    rooms[code] = { code, players: [makePlayer(socket.id, cleanName(name))], hostId: socket.id,
      phase: 'lobby', turn: 0, last: null, reveal: null, table: null };
    socket.join(code);
    cb && cb({ ok: true });
    broadcast(rooms[code]);
  });

  socket.on('join', ({ code: c, name } = {}, cb) => {
    const r = rooms[String(c || '').toUpperCase().trim()];
    if (!r) return cb && cb({ error: 'No room with that code.' });
    if (r.phase !== 'lobby') return cb && cb({ error: 'That game has already started.' });
    if (r.players.length >= 4) return cb && cb({ error: 'That room is full (4 players max).' });
    code = r.code;
    r.players.push(makePlayer(socket.id, cleanName(name)));
    socket.join(code);
    cb && cb({ ok: true });
    broadcast(r);
  });

  socket.on('start', () => {
    const r = room();
    if (!r || r.hostId !== socket.id || r.phase !== 'lobby' || r.players.length < 2) return;
    r.players.forEach((p) => { p.alive = true; p.pulls = 0; p.bullet = Math.floor(Math.random() * 6); });
    startRound(r, Math.floor(Math.random() * r.players.length));
    broadcast(r);
  });

  socket.on('play', (idx) => {
    const r = room();
    if (!r || r.phase !== 'playing' || !Array.isArray(idx)) return;
    const p = r.players[r.turn];
    if (p.id !== socket.id) return;
    const u = [...new Set(idx)].filter((i) => Number.isInteger(i) && i >= 0 && i < p.hand.length);
    if (u.length < 1 || u.length > 3 || u.length !== idx.length) return;
    const cards = u.map((i) => p.hand[i]);
    p.hand = p.hand.filter((_, i) => !u.includes(i));
    r.last = { by: r.turn, cards };
    r.turn = nextAlive(r, r.turn);
    broadcast(r);
  });

  socket.on('liar', () => {
    const r = room();
    if (!r || r.phase !== 'playing' || !r.last) return;
    if (r.players[r.turn].id !== socket.id) return;
    const accused = r.last.by;
    const lie = r.last.cards.some((c) => c !== r.table && c !== 'J'); // jokers are wild
    const spinner = lie ? accused : r.turn;
    const sp = r.players[spinner];
    const died = sp.pulls === sp.bullet; // one bullet hidden in 6 chambers
    sp.pulls++;
    if (died) sp.alive = false;
    r.reveal = { caller: r.turn, accused, cards: r.last.cards, lie, spinner, died };
    r.phase = 'reveal';
    broadcast(r);
    r.timer = setTimeout(() => {
      if (!rooms[r.code]) return;
      startRound(r, spinner);
      broadcast(r);
    }, 7000);
  });

  socket.on('again', () => {
    const r = room();
    if (!r || r.hostId !== socket.id || r.phase !== 'over') return;
    r.players = r.players.filter((p) => !p.gone);
    r.players.forEach((p) => { p.hand = []; p.alive = true; p.pulls = 0; });
    r.phase = 'lobby';
    r.reveal = null;
    broadcast(r);
  });

  socket.on('disconnect', () => {
    const r = room();
    if (!r) return;
    const i = r.players.findIndex((p) => p.id === socket.id);
    if (i < 0) return;
    if (r.phase === 'lobby' || r.phase === 'over') r.players.splice(i, 1);
    else { r.players[i].gone = true; r.players[i].alive = false; }
    const left = r.players.filter((p) => !p.gone);
    if (!left.length) { clearTimeout(r.timer); delete rooms[r.code]; return; }
    if (r.hostId === socket.id) r.hostId = left[0].id;
    // Someone left mid-round: redeal with the remaining players.
    if (r.phase === 'playing') startRound(r, Math.max(0, i));
    broadcast(r);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Liars Bar Lite running on port ' + PORT));
