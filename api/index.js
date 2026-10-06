// src/engine.ts
var COLOR_NAMES = ["Blue", "Coral", "Gold", "Jade", "Violet"];
var id = (s, r, c) => `${s}:${r}:${c}`;
var parse = (cell) => cell.split(":").map(Number);
var CELLS = Array.from({ length: 5 }, (_, s) => Array.from({ length: 5 }, (_2, r) => Array.from({ length: 8 }, (_3, c) => id(s, r, c)))).flat(2);
var cellSet = new Set(CELLS);
function step(cell, dr, dc) {
  const [s, r, c] = parse(cell);
  if (dr < 0 && r === 0) {
    return [2, 3].map((offset) => ({ cell: id((s + offset) % 5, 0, ((7 - c - dc) % 8 + 8) % 8), dr: 1, dc: -dc }));
  }
  const nr = r + dr;
  if (nr < 0 || nr > 4) return [];
  const lane = s * 8 + c + dc;
  return [{ cell: id((Math.floor(lane / 8) % 5 + 5) % 5, nr, (lane % 8 + 8) % 8), dr, dc }];
}
var ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
var DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
var GRAPH = Object.fromEntries(CELLS.map((cell) => [cell, { orthogonal: ORTH.flatMap(([a, b]) => step(cell, a, b).map((x) => x.cell)), diagonal: DIAG.flatMap(([a, b]) => step(cell, a, b).map((x) => x.cell)) }]));
function createGame(names, mode = "clock", now = Date.now()) {
  const board = {};
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let s = 0; s < 5; s++) for (let c = 0; c < 8; c++) {
    board[id(s, 4, c)] = { kind: back[c], owner: s };
    board[id(s, 3, c)] = { kind: "P", owner: s };
  }
  return { board, players: names.map((name) => ({ name, alive: true, time: mode === "clock" ? 6e5 : { casual: 45e3, rapid: 2e4, blitz: 8e3 }[mode] ?? 6e5, captures: 0, queens: 0, mates: 0 })), turn: 0, round: 1, moves: 0, events: [], started: now, tick: now, mode, status: "playing" };
}
function rays(g, from, dirs) {
  const out = /* @__PURE__ */ new Set();
  const owner = g.board[from].owner;
  for (const [dr, dc] of dirs) {
    const queue = step(from, dr, dc);
    const seen = /* @__PURE__ */ new Set([from]);
    while (queue.length) {
      const p = queue.shift();
      if (seen.has(p.cell)) continue;
      seen.add(p.cell);
      const piece = g.board[p.cell];
      if (piece?.owner === owner) continue;
      out.add(p.cell);
      if (!piece) queue.push(...step(p.cell, p.dr, p.dc));
    }
  }
  return [...out];
}
function knightLinks(from) {
  const out = [];
  for (const [a, b] of ORTH) for (const x of step(from, a, b)) for (const y of step(x.cell, x.dr, x.dc)) for (const sign of [-1, 1]) out.push(...step(y.cell, y.dc * sign, y.dr * sign).map((z) => z.cell));
  return out.filter((c) => c !== from);
}
var KNIGHT_GRAPH = Object.fromEntries(CELLS.map((c) => [c, []]));
for (const from of CELLS) for (const to of knightLinks(from)) {
  if (!KNIGHT_GRAPH[from].includes(to)) KNIGHT_GRAPH[from].push(to);
  if (!KNIGHT_GRAPH[to].includes(from)) KNIGHT_GRAPH[to].push(from);
}
function pseudo(g, from, attack = false) {
  const piece = g.board[from];
  if (!piece) return [];
  const [s, r, c] = parse(from);
  let cells = [];
  if (["R", "B", "Q"].includes(piece.kind)) cells = rays(g, from, piece.kind === "R" ? ORTH : piece.kind === "B" ? DIAG : [...ORTH, ...DIAG]);
  if (piece.kind === "K") cells = [...ORTH, ...DIAG].flatMap(([a, b]) => step(from, a, b).map((x) => x.cell));
  if (piece.kind === "N") cells = KNIGHT_GRAPH[from];
  if (piece.kind === "P") {
    const moves = [];
    const dir = piece.destination === void 0 ? -1 : 1;
    for (const dc of attack ? [-1, 1] : [0, -1, 1]) for (const next of step(from, dir, dc)) {
      const target = g.board[next.cell];
      const dest = parse(next.cell)[0];
      if (attack || (dc === 0 ? !target : !!target && target.owner !== piece.owner)) moves.push({ from, to: next.cell, ...r === 0 && dir < 0 ? { destination: dest } : {} });
    }
    if (!attack && r === 3 && s === piece.owner && !piece.moved && piece.destination === void 0 && !g.board[id(s, 2, c)] && !g.board[id(s, 1, c)]) moves.push({ from, to: id(s, 1, c) });
    return moves.filter((m) => attack || g.board[m.to]?.kind !== "K");
  }
  return [...new Set(cells)].filter((to) => to !== from && g.board[to]?.owner !== piece.owner && (attack || g.board[to]?.kind !== "K")).map((to) => ({ from, to }));
}
function inCheck(g, owner) {
  const king = Object.keys(g.board).find((c) => g.board[c].owner === owner && g.board[c].kind === "K");
  if (!king) return true;
  return Object.entries(g.board).some(([cell, p]) => p.owner !== owner && g.players[p.owner].alive && pseudo(g, cell, true).some((m) => m.to === king));
}
function applyBoard(g, m) {
  const board = { ...g.board };
  const p = { ...board[m.from], moved: true };
  delete board[m.from];
  if (m.destination !== void 0) p.destination = m.destination;
  if (p.kind === "P" && p.destination !== void 0 && parse(m.to)[1] === 4) p.kind = m.promotion ?? "Q";
  board[m.to] = p;
  return board;
}
function legalMoves(g, from) {
  const p = g.board[from];
  if (!p || !g.players[p.owner].alive || g.status !== "playing") return [];
  return pseudo(g, from).filter((m) => !inCheck({ ...g, board: applyBoard(g, m) }, p.owner));
}
function hasEscape(g, owner) {
  return Object.keys(g.board).some((c) => g.board[c].owner === owner && legalMoves(g, c).length > 0);
}
function eliminate(g, owner, reason, killer) {
  if (!g.players[owner].alive) return;
  const remaining = g.players.filter((p) => p.alive).length;
  g.players[owner].alive = false;
  g.players[owner].place = remaining;
  for (const c of Object.keys(g.board)) if (g.board[c].owner === owner) delete g.board[c];
  if (killer !== void 0 && reason === "CHECKMATE") g.players[killer].mates++;
  g.events.push({ number: g.moves, owner, text: reason, at: Date.now() });
  const alive = g.players.map((p, i) => p.alive ? i : -1).filter((i) => i >= 0);
  if (alive.length <= 1) {
    g.status = "finished";
    g.winner = alive[0];
    if (g.winner !== void 0) g.players[g.winner].place = 1;
  }
}
function nextTurn(g, now) {
  if (g.status !== "playing") return;
  const before = g.turn;
  do {
    g.turn = (g.turn + 1) % 5;
  } while (!g.players[g.turn].alive);
  if (g.turn <= before) g.round++;
  g.tick = now;
  if (g.mode !== "clock") g.players[g.turn].time = { casual: 45e3, rapid: 2e4, blitz: 8e3 }[g.mode] ?? 45e3;
  if (!hasEscape(g, g.turn)) {
    eliminate(g, g.turn, inCheck(g, g.turn) ? "CHECKMATE" : "STALEMATE");
    nextTurn(g, now);
  }
}
function advanceClock(g, now = Date.now()) {
  if (g.status !== "playing") return false;
  const elapsed = Math.max(0, now - g.tick);
  g.players[g.turn].time = Math.max(0, g.players[g.turn].time - elapsed);
  g.tick = now;
  if (g.players[g.turn].time === 0) {
    eliminate(g, g.turn, "TIME OUT");
    nextTurn(g, now);
    return true;
  }
  return false;
}
function play(g, m, owner, now = Date.now()) {
  const next = structuredClone(g);
  advanceClock(next, now);
  if (next.status !== "playing" || next.turn !== owner) throw new Error("\u0421\u0435\u0439\u0447\u0430\u0441 \u0445\u043E\u0434 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u0438\u0433\u0440\u043E\u043A\u0430");
  if (!cellSet.has(m.from) || !cellSet.has(m.to) || next.board[m.from]?.owner !== owner) throw new Error("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0432\u043E\u044E \u0444\u0438\u0433\u0443\u0440\u0443");
  if (m.promotion && !["Q", "R", "B", "N"].includes(m.promotion)) throw new Error("\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u043E\u0435 \u043F\u0440\u0435\u0432\u0440\u0430\u0449\u0435\u043D\u0438\u0435");
  const valid = legalMoves(next, m.from).find((x) => x.to === m.to && (x.destination ?? void 0) === (m.destination ?? void 0));
  if (!valid) throw new Error("\u042D\u0442\u043E\u0442 \u0445\u043E\u0434 \u043D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C");
  const piece = next.board[m.from], captured = next.board[m.to];
  next.board = applyBoard(next, m);
  next.moves++;
  next.lastMove = m;
  if (captured) {
    next.players[owner].captures++;
    if (captured.kind === "Q") next.players[owner].queens++;
  }
  next.events.push({ number: next.moves, owner, text: `${piece.kind}${captured ? " \xD7 " : " \xB7 "}${notation(m.from)} \u2192 ${notation(m.to)}${m.destination !== void 0 ? " \u2197 " + COLOR_NAMES[m.destination] : ""}`, from: m.from, to: m.to, at: now });
  if (next.mode === "clock") next.players[owner].time += 3e3;
  let changed = true;
  while (changed && next.status === "playing") {
    changed = false;
    for (let i = 0; i < 5; i++) if (next.players[i].alive && inCheck(next, i) && !hasEscape(next, i)) {
      eliminate(next, i, "CHECKMATE", i === owner ? void 0 : owner);
      changed = true;
    }
  }
  nextTurn(next, now);
  return next;
}
function notation(c) {
  const [s, r, l] = parse(c);
  return `${"ABCDE"[s]}${"abcdefgh"[l]}${5 - r}`;
}

// src/rooms.ts
var fail = (text) => {
  throw new Error(text);
};
var roomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (v) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[v % 32]).join("");
var nickname = (value) => typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 20 ? value.trim() : fail("\u0418\u043C\u044F \u0434\u043E\u043B\u0436\u043D\u043E \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u043E\u0442 1 \u0434\u043E 20 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432");
function view(room, token) {
  const member = room.members.find((p) => p.token === token);
  return { ...room, members: room.members.map(({ token: token2, ...p }) => p), you: member?.seat, joined: !!member };
}
function start(room, now) {
  const members = [...room.members];
  for (let i = 4; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [members[i], members[j]] = [members[j], members[i]];
  }
  members.forEach((m, i) => m.seat = i);
  room.game = createGame(members.map((m) => m.name), room.mode, now);
}
function maintain(room, now) {
  if (room.game?.status === "playing") {
    advanceClock(room.game, now);
    if (!room.practice) {
      for (const m of room.members) if (m.seat !== void 0 && room.game.players[m.seat].alive && now - m.seen > 9e4) {
        const turn = room.game.turn;
        eliminate(room.game, m.seat, "DISCONNECTED");
        if (turn === m.seat) nextTurn(room.game, now);
      }
    }
  }
}
async function handle(store2, action, data, token, now = Date.now()) {
  if (token.length < 24 || token.length > 128) fail("\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430");
  if (action === "create") {
    if (!["clock", "casual", "rapid", "blitz"].includes(data.mode)) fail("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u0432\u0440\u0435\u043C\u0435\u043D\u0438");
    for (let i = 0; i < 5; i++) {
      const code2 = roomCode();
      if (await store2.get(code2)) continue;
      const room = { code: code2, members: [{ token, name: nickname(data.name), ready: false, seen: now }], mode: data.mode, version: 1, practice: data.practice === true, created: now, chat: [] };
      if (room.practice) {
        room.members = [nickname(data.name), "Alex", "Mika", "Denis", "Sasha"].map((name, i2) => ({ token: i2 === 0 ? token : crypto.randomUUID(), name, ready: true, seen: now, seat: i2 }));
        room.game = createGame(room.members.map((m) => m.name), room.mode, now);
      }
      if (await store2.save(room, 0)) return view(room, token);
    }
    fail("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u043A\u043E\u043C\u043D\u0430\u0442\u0443");
  }
  const code = typeof data.code === "string" ? data.code.toUpperCase() : "";
  if (!/^[A-Z2-9]{6}$/.test(code)) fail("\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043A\u043E\u0434 \u043A\u043E\u043C\u043D\u0430\u0442\u044B");
  for (let attempt = 0; attempt < 5; attempt++) {
    const original = await store2.get(code);
    if (!original) fail("\u041A\u043E\u043C\u043D\u0430\u0442\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430");
    const room = structuredClone(original);
    const member = room.members.find((p) => p.token === token);
    if (action === "join" && !member) {
      if (room.game || room.members.length === 5) fail("\u041A\u043E\u043C\u043D\u0430\u0442\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u0430");
      room.members.push({ token, name: nickname(data.name), ready: false, seen: now });
    } else if (action !== "spectate" && !member) fail("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u0438\u0442\u0435\u0441\u044C \u043A \u043A\u043E\u043C\u043D\u0430\u0442\u0435");
    maintain(room, now);
    if (member) member.seen = now;
    if (action === "ready") {
      if (room.game) fail("\u041F\u0430\u0440\u0442\u0438\u044F \u0443\u0436\u0435 \u043D\u0430\u0447\u0430\u043B\u0430\u0441\u044C");
      member.ready = !member.ready;
      if (room.members.length === 5 && room.members.every((m) => m.ready)) start(room, now);
    }
    if (action === "moves") {
      if (!room.game) fail("\u041F\u0430\u0440\u0442\u0438\u044F \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u043B\u0430\u0441\u044C");
      const p = room.game.board[data.from];
      const moves = p && (room.practice || member.seat === p.owner) && p.owner === room.game.turn ? legalMoves(room.game, data.from) : [];
      room.version++;
      if (await store2.save(room, original.version)) return { moves, room: view(room, token) };
      continue;
    }
    if (action === "move") {
      if (!room.game) fail("\u041F\u0430\u0440\u0442\u0438\u044F \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u043B\u0430\u0441\u044C");
      room.game = play(room.game, data.move, room.practice ? room.game.turn : member.seat, now);
    }
    if (action === "resign") {
      if (!room.game || member.seat === void 0) fail("\u041F\u0430\u0440\u0442\u0438\u044F \u0435\u0449\u0451 \u043D\u0435 \u043D\u0430\u0447\u0430\u043B\u0430\u0441\u044C");
      const current = room.game.turn;
      eliminate(room.game, room.practice ? current : member.seat, "RESIGNED");
      if (room.practice || current === member.seat) nextTurn(room.game, now);
    }
    if (action === "chat") {
      if (typeof data.text !== "string" || !data.text.trim() || data.text.length > 240) fail("\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043A\u043E\u0440\u043E\u0447\u0435 240 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432");
      const previous = room.chat.filter((m) => m.name === member.name).at(-1);
      if (previous && now - previous.at < 1500) fail("\u041F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 \u043F\u0435\u0440\u0435\u0434 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u043C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435\u043C");
      room.chat.push({ name: member.name, text: data.text.trim(), at: now });
      room.chat = room.chat.slice(-80);
    }
    if (!["sync", "join", "ready", "move", "resign", "chat", "spectate"].includes(action)) fail("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435");
    room.version++;
    if (await store2.save(room, original.version)) return view(room, token);
  }
  fail("\u041F\u043E\u0437\u0438\u0446\u0438\u044F \u043E\u0431\u043D\u043E\u0432\u0438\u043B\u0430\u0441\u044C. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435");
}

// src/shell.ts
var html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#111916"><meta name="description" content="\u041F\u044F\u0442\u044C \u0438\u0433\u0440\u043E\u043A\u043E\u0432. \u041E\u0434\u043D\u0430 \u0434\u043E\u0441\u043A\u0430. \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0439 \u043A\u043E\u0440\u043E\u043B\u044C \u043F\u043E\u0431\u0435\u0436\u0434\u0430\u0435\u0442."><title>PentaChess \u2014 Five Kings</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`;

// src/vercel.ts
var memory = /* @__PURE__ */ new Map();
function rest() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : void 0;
}
async function command(rest_, args) {
  const response = await fetch(rest_.url, { method: "POST", headers: { Authorization: `Bearer ${rest_.token}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!response.ok) throw new Error("\u0425\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E");
  return (await response.json()).result;
}
function store() {
  const remote = rest();
  if (!remote) return {
    async get(code) {
      return memory.get(code);
    },
    async save(room, previous) {
      if ((memory.get(room.code)?.version ?? 0) !== previous) return false;
      memory.set(room.code, room);
      return true;
    }
  };
  return {
    async get(code) {
      const raw = await command(remote, ["GET", `pentachess:${code}`]);
      return typeof raw === "string" && raw ? JSON.parse(raw) : void 0;
    },
    async save(room, previous) {
      const key = `pentachess:${room.code}`;
      const raw = await command(remote, ["GET", key]);
      const version = typeof raw === "string" && raw ? JSON.parse(raw).version : 0;
      if (version !== previous) return false;
      await command(remote, ["SET", key, JSON.stringify(room)]);
      return true;
    }
  };
}
function send(res, status, body, type = "application/json") {
  res.statusCode = status;
  res.setHeader("Content-Type", `${type}; charset=utf-8`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.end(body);
}
async function handler(req, res) {
  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", "http://" + host);
  if (url.pathname === "/ws") {
    send(res, 426, "Hosted transport uses authoritative HTTP synchronization", "text/plain");
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, "Method not allowed", "text/plain");
    return;
  }
  try {
    const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
    if (origin && new URL(origin).host !== host) throw new Error("Origin rejected");
    let payload;
    if (req.body && typeof req.body === "object") payload = req.body;
    else {
      let raw = typeof req.body === "string" ? req.body : "";
      if (!raw && req[Symbol.asyncIterator]) for await (const chunk of req) raw += chunk;
      if (raw.length > 8192) throw new Error("\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u0437\u0430\u043F\u0440\u043E\u0441");
      payload = JSON.parse(raw || "{}");
    }
    const { action, ...data } = payload;
    const session = Array.isArray(req.headers["x-session"]) ? req.headers["x-session"][0] : req.headers["x-session"] ?? "";
    const result = await handle(store(), String(action), data, String(session));
    send(res, 200, JSON.stringify(result));
  } catch (e) {
    send(res, 400, JSON.stringify({ error: e instanceof Error ? e.message : "\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430" }));
  }
}
export {
  handler as default,
  html
};
