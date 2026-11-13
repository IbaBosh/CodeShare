'use strict';
const path = require('path');
const http = require('http');
const { randomInt } = require('node:crypto');
const express = require('express');
const { Server } = require('socket.io');
const { createGame, publicState, playCard, drawCard, passTurn, callUno, catchUno } = require('./game/engine');
const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
function originAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (allowedOrigins.length) return allowedOrigins.includes(origin);
  try { return new URL(origin).host === request.headers.host; }
  catch { return false; }
}
const io = new Server(server, {
  cors: allowedOrigins.length ? { origin: allowedOrigins } : false,
  allowRequest: (request, callback) => callback(null, originAllowed(request)),
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 16384,
});
const rooms = new Map();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use('/assets/audio', express.static(path.join(__dirname, 'assets', 'audio'), { maxAge: '1d', etag: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'uno-arena', rooms: rooms.size }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const cleanName = s => String(s || 'Player').trim().replace(/[\u0000-\u001F\u007F<>]/g, '').slice(0, 18) || 'Player';
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from({ length: 5 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
const objectPayload = value => value && typeof value === 'object' ? value : {};
function emitRoom(room) {
  for (const p of room.players) {
    const sock = io.sockets.sockets.get(p.id);
    if (!sock) continue;
    sock.emit('room-state', {
      code: room.id, host: room.host, isHost: room.host === p.id,
      maxPlayers: room.maxPlayers, gameStarted: Boolean(room.game),
      players: room.players.map(({ id, name }) => ({ id, name })),
    });
    if (room.game) sock.emit('state', publicState(room.game, p.id));
  }
}
function fail(socket, message) { socket.emit('notice', { type: 'error', message }); }
function rateLimit(socket, key, interval = 350) {
  const now = Date.now();
  socket.data.rates ||= {};
  if (now - (socket.data.rates[key] || 0) < interval) return false;
  socket.data.rates[key] = now;
  return true;
}
function leave(socket) {
  const id = socket.data.room;
  if (!id) return;
  const room = rooms.get(id);
  socket.data.room = null;
  if (!room) return;
  const oldIndex = room.game?.players.findIndex(p => p.id === socket.id) ?? -1;
  room.players = room.players.filter(p => p.id !== socket.id);
  if (!room.players.length) rooms.delete(id);
  else {
    if (room.host === socket.id) room.host = room.players[0].id;
    if (room.game && oldIndex >= 0) {
      if (room.game.unoPending === socket.id) room.game.unoPending = null;
      room.game.players.splice(oldIndex, 1);
      if (oldIndex < room.game.turn) room.game.turn--;
      if (room.game.turn >= room.game.players.length) room.game.turn = 0;
      if (room.game.players.length === 1) room.game.winner = room.game.players[0].id;
    }
    emitRoom(room);
    io.to(id).emit('notice', { type: 'info', message: 'A player left the room.' });
  }
  socket.leave(id);
}
io.on('connection', socket => {
  socket.on('create-room', payload => {
    const { name, maxPlayers = 6 } = objectPayload(payload);
    if (!rateLimit(socket, 'create-room', 1500)) return fail(socket, 'Please wait before creating another room.');
    leave(socket);
    let id;
    do { id = code(); } while (rooms.has(id));
    const player = { id: socket.id, name: cleanName(name) };
    const room = { id, host: socket.id, maxPlayers: Math.max(2, Math.min(6, Math.trunc(Number(maxPlayers) || 6))), players: [player], game: null };
    rooms.set(id, room); socket.data.room = id; socket.join(id);
    socket.emit('room-created', { code: id }); emitRoom(room);
  });
  socket.on('join-room', payload => {
    const { name, code: raw } = objectPayload(payload);
    if (!rateLimit(socket, 'join-room', 1000)) return fail(socket, 'Please wait before joining another room.');
    leave(socket);
    const id = String(raw || '').toUpperCase().trim(); const room = rooms.get(id);
    if (!room) return fail(socket, 'Room not found. Check the code.');
    if (room.game) return fail(socket, 'This match has already started.');
    if (room.players.length >= room.maxPlayers) return fail(socket, 'This room is full.');
    room.players.push({ id: socket.id, name: cleanName(name) }); socket.data.room = id; socket.join(id);
    socket.emit('room-joined', { code: id }); emitRoom(room);
  });
  socket.on('leave-room', () => leave(socket));
  socket.on('start-online', () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.host !== socket.id) return fail(socket, 'Only the host can start the match.');
    if (room.game) return fail(socket, 'This match has already started.');
    if (room.players.length < 2) return fail(socket, 'At least two players are required.');
    room.game = createGame(room.players.map(p => ({ ...p, bot: false })));
    emitRoom(room);
  });
  socket.on('play-card', payload => {
    const { cardId, color } = objectPayload(payload);
    if (!rateLimit(socket, 'game-action', 180)) return;
    const room = rooms.get(socket.data.room); if (!room?.game) return;
    try { playCard(room.game, socket.id, cardId, color); emitRoom(room); } catch (e) { fail(socket, e.message); }
  });
  socket.on('draw-card', () => {
    if (!rateLimit(socket, 'game-action', 180)) return;
    const room = rooms.get(socket.data.room); if (!room?.game) return;
    try { drawCard(room.game, socket.id); emitRoom(room); } catch (e) { fail(socket, e.message); }
  });
  socket.on('pass-turn', () => {
    if (!rateLimit(socket, 'game-action', 180)) return;
    const room = rooms.get(socket.data.room); if (!room?.game) return;
    try { passTurn(room.game, socket.id); emitRoom(room); } catch (e) { fail(socket, e.message); }
  });
  socket.on('call-uno', () => {
    if (!rateLimit(socket, 'uno', 300)) return;
    const room = rooms.get(socket.data.room); if (!room?.game) return;
    try { callUno(room.game, socket.id); emitRoom(room); } catch (e) { fail(socket, e.message); }
  });
  socket.on('catch-uno', () => {
    if (!rateLimit(socket, 'uno', 300)) return;
    const room = rooms.get(socket.data.room); if (!room?.game) return;
    try { catchUno(room.game, socket.id); emitRoom(room); } catch (e) { fail(socket, e.message); }
  });
  socket.on('disconnect', () => leave(socket));
});
const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`UNO Arena listening on ${port}`));
