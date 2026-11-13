'use strict';

const COLORS = Object.freeze(['red', 'yellow', 'green', 'blue']);
const ACTIONS = Object.freeze(['skip', 'reverse', 'draw2']);
const makeId = () => (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));

function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ id: makeId(), color, value: '0', type: 'number' });
    for (let n = 1; n <= 9; n++) for (let copy = 0; copy < 2; copy++) deck.push({ id: makeId(), color, value: String(n), type: 'number' });
    for (const value of ACTIONS) for (let copy = 0; copy < 2; copy++) deck.push({ id: makeId(), color, value, type: 'action' });
  }
  for (let copy = 0; copy < 4; copy++) {
    deck.push({ id: makeId(), color: 'wild', value: 'wild', type: 'wild' });
    deck.push({ id: makeId(), color: 'wild', value: 'wild4', type: 'wild' });
  }
  return deck;
}

function shuffle(cards) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createGame(players) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 6) throw new Error('Choisis entre 2 et 6 joueurs.');
  const deck = shuffle(buildDeck());
  const seats = players.map((player, index) => ({
    id: String(player.id || `player-${index + 1}`),
    name: String(player.name || `Joueur ${index + 1}`).slice(0, 18),
    bot: Boolean(player.bot),
    hand: deck.splice(0, 7),
    saidUno: false,
  }));
  let first = deck.shift();
  while (first && first.type === 'wild') { deck.push(first); first = deck.shift(); }
  const game = {
    players: seats,
    deck,
    discard: [first],
    turn: 0,
    direction: 1,
    chosenColor: first.color,
    pendingDraw: 0,
    drawnCardId: null,
    unoPending: null,
    started: true,
    winner: null,
    lastAction: 'La partie commence !',
  };

  // Apply the opening action card just like a normal turn. Wild cards are
  // returned to the deck above so the opening colour is always defined.
  if (first.value === 'skip') {
    game.turn = 1 % seats.length;
    game.lastAction = 'Le premier joueur passe son tour.';
  } else if (first.value === 'reverse') {
    game.direction = -1;
    game.turn = (seats.length - 1) % seats.length;
    game.lastAction = 'Le sens du jeu est inversé.';
  } else if (first.value === 'draw2') {
    game.turn = 1 % seats.length;
    game.pendingDraw = 2;
    game.lastAction = 'Le premier joueur pioche +2 cartes.';
  }
  return game;
}

function currentPlayer(game) { return game.players[game.turn]; }
function topCard(game) { return game.discard[game.discard.length - 1]; }
function refill(game) {
  if (game.deck.length) return;
  if (game.discard.length <= 1) return;
  const top = game.discard.pop();
  game.deck = shuffle(game.discard);
  game.discard = [top];
}
function advance(game, steps = 1) {
  const count = game.players.length;
  game.turn = (game.turn + (game.direction * steps) + count * steps) % count;
  game.drawnCardId = null;
}
function isPlayable(game, card) {
  const top = topCard(game);
  if (!top) return true;
  return card.color === 'wild' || card.color === game.chosenColor || card.value === top.value;
}
function assertTurn(game, playerId) {
  if (game.winner) throw new Error('La partie est terminée.');
  if (currentPlayer(game)?.id !== playerId) throw new Error("Ce n'est pas ton tour.");
}
function clearExpiredUno(game, actingPlayerId) {
  if (game.unoPending && game.unoPending !== actingPlayerId) game.unoPending = null;
}
function drawFromDeck(game, player, count = 1) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    refill(game);
    if (!game.deck.length) break;
    const card = game.deck.pop();
    player.hand.push(card);
    drawn.push(card);
  }
  return drawn;
}

function playCard(game, playerId, cardId, chosenColor) {
  assertTurn(game, playerId);
  clearExpiredUno(game, playerId);
  const player = currentPlayer(game);
  const index = player.hand.findIndex(card => card.id === cardId);
  if (index < 0) throw new Error('Carte introuvable dans ta main.');
  const card = player.hand[index];
  if (game.drawnCardId && game.drawnCardId !== card.id) throw new Error('Tu peux jouer uniquement la carte que tu viens de piocher, ou passer.');
  if (game.pendingDraw && !['draw2', 'wild4'].includes(card.value)) throw new Error('Tu dois cumuler une carte +2 / +4 ou piocher la pénalité.');
  if (!isPlayable(game, card)) throw new Error('Cette carte ne peut pas être jouée maintenant.');
  if (card.type === 'wild' && !COLORS.includes(chosenColor)) throw new Error('Choisis une couleur.');

  player.hand.splice(index, 1);
  game.discard.push(card);
  game.chosenColor = card.type === 'wild' ? chosenColor : card.color;
  game.lastAction = `${player.name} joue ${card.value}`;
  game.drawnCardId = null;
  player.saidUno = false;
  if (player.hand.length === 1) game.unoPending = player.id;

  if (player.hand.length === 0) {
    game.winner = player.id;
    game.unoPending = null;
    game.lastAction = `${player.name} remporte la partie !`;
    return;
  }

  if (card.value === 'reverse') {
    if (game.players.length === 2) advance(game, 2);
    else { game.direction *= -1; advance(game); }
  } else if (card.value === 'skip') {
    advance(game, 2);
  } else if (card.value === 'draw2' || card.value === 'wild4') {
    game.pendingDraw += card.value === 'draw2' ? 2 : 4;
    advance(game);
  } else {
    advance(game);
  }
}

function drawCard(game, playerId) {
  assertTurn(game, playerId);
  clearExpiredUno(game, playerId);
  const player = currentPlayer(game);
  if (game.drawnCardId) throw new Error('Tu as déjà pioché. Joue cette carte si elle convient, ou passe ton tour.');
  if (game.pendingDraw) {
    const penalty = game.pendingDraw;
    drawFromDeck(game, player, penalty);
    game.pendingDraw = 0;
    game.lastAction = `${player.name} pioche ${penalty} cartes`;
    advance(game);
    return [];
  }
  const [card] = drawFromDeck(game, player, 1);
  game.drawnCardId = card?.id || null;
  game.lastAction = card ? `${player.name} pioche une carte` : `${player.name} ne peut plus piocher`;
  if (!card) advance(game);
  return card || null;
}

function passTurn(game, playerId) {
  assertTurn(game, playerId);
  clearExpiredUno(game, playerId);
  if (game.pendingDraw) throw new Error('La pénalité doit être piochée ou cumulée.');
  if (!game.drawnCardId) throw new Error('Pioche une carte avant de passer.');
  game.drawnCardId = null;
  game.lastAction = `${currentPlayer(game).name} passe son tour`;
  advance(game);
}

function callUno(game, playerId) {
  const player = game.players.find(entry => entry.id === playerId);
  if (!player || player.hand.length !== 1) throw new Error("Tu peux annoncer UNO uniquement avec une carte.");
  player.saidUno = true;
  if (game.unoPending === playerId) game.unoPending = null;
  game.lastAction = `${player.name} annonce UNO !`;
}

function catchUno(game, playerId) {
  assertTurn(game, playerId);
  const target = game.players.find(entry => entry.id === game.unoPending);
  if (!target || target.saidUno || target.hand.length !== 1) throw new Error("Personne n'a oublié d'annoncer UNO.");
  drawFromDeck(game, target, 2);
  game.unoPending = null;
  game.lastAction = `${target.name} oublie UNO : +2 cartes !`;
}

function publicState(game, playerId) {
  const you = game.players.find(player => player.id === playerId);
  return {
    you: playerId,
    players: game.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      count: player.hand.length,
      hand: player.id === playerId ? player.hand : undefined,
      bot: player.bot,
      saidUno: player.saidUno,
      active: index === game.turn,
    })),
    top: topCard(game),
    chosenColor: game.chosenColor,
    deckCount: game.deck.length,
    turn: currentPlayer(game)?.id,
    direction: game.direction,
    pendingDraw: game.pendingDraw,
    drawnCardId: currentPlayer(game)?.id === playerId ? game.drawnCardId : null,
    unoPending: game.unoPending,
    canCatchUno: Boolean(game.unoPending && game.unoPending !== playerId && currentPlayer(game)?.id === playerId),
    winner: game.winner,
    lastAction: game.lastAction,
    yourHandCount: you?.hand.length || 0,
  };
}

function chooseBotCard(game, player, difficulty) {
  const options = player.hand.filter(card => isPlayable(game, card) && (!game.pendingDraw || ['draw2', 'wild4'].includes(card.value)));
  if (!options.length) return null;
  if (difficulty === 'easy') return options[Math.floor(Math.random() * options.length)];

  const colorCounts = Object.fromEntries(COLORS.map(color => [color, player.hand.filter(card => card.color === color).length]));
  const rank = card => {
    let points = ({ wild4: 16, draw2: 12, skip: 9, reverse: 7, wild: 5 })[card.value] || 1;
    if (difficulty === 'hard') {
      points += colorCounts[card.color] ? colorCounts[card.color] * 2 : 0;
      const rivalLow = game.players.some(other => other.id !== player.id && other.hand.length <= 2);
      if (rivalLow && ['draw2', 'wild4', 'skip'].includes(card.value)) points += 8;
      if (card.type === 'wild') points += 2;
    } else {
      points += colorCounts[card.color] || 0;
    }
    return points;
  };
  return [...options].sort((a, b) => rank(b) - rank(a))[0];
}

function botTurn(game, difficulty = 'medium') {
  const player = currentPlayer(game);
  if (!player?.bot || game.winner) return false;
  if (game.unoPending && game.unoPending !== player.id) {
    const forgotten = game.players.find(entry => entry.id === game.unoPending);
    if (forgotten && !forgotten.saidUno && forgotten.hand.length === 1 && (difficulty === 'hard' || (difficulty === 'medium' && Math.random() > 0.55))) catchUno(game, player.id);
    else game.unoPending = null;
  }
  let card = chooseBotCard(game, player, difficulty);
  if (!card) {
    const drawn = drawCard(game, player.id);
    if (!drawn) return true;
    // A playable card drawn from the deck may be played immediately.
    card = isPlayable(game, drawn) && (!game.pendingDraw || ['draw2', 'wild4'].includes(drawn.value)) ? drawn : null;
    if (!card) { passTurn(game, player.id); return true; }
  }
  const counts = COLORS.map(color => ({ color, count: player.hand.filter(entry => entry.color === color).length })).sort((a, b) => b.count - a.count);
  const selectedColor = counts[0]?.color || COLORS[Math.floor(Math.random() * COLORS.length)];
  playCard(game, player.id, card.id, selectedColor);
  if (player.hand.length === 1) callUno(game, player.id);
  return true;
}

const API = { COLORS, buildDeck, shuffle, createGame, currentPlayer, topCard, isPlayable, playCard, drawCard, passTurn, callUno, catchUno, publicState, botTurn };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.UnoEngine = API;
