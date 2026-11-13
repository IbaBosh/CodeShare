'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../game/engine');

function makeTestGame(players) {
  const game = E.createGame(players);
  game.turn = 0;
  game.direction = 1;
  game.pendingDraw = 0;
  game.drawnCardId = null;
  game.unoPending = null;
  game.chosenColor = 'red';
  game.winner = null;
  game.discard[game.discard.length - 1] = { id: 'fixture-top', color: 'red', value: '7', type: 'number' };
  return game;
}

test('le paquet standard contient 108 cartes', () => {
  const deck = E.buildDeck();
  assert.equal(deck.length, 108);
  assert.equal(new Set(deck.map(card => card.id)).size, 108);
});

test('la création distribue sept cartes à chaque joueur', () => {
  const game = makeTestGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]);
  assert.deepEqual(game.players.map(player => player.hand.length), [7, 7, 7]);
  assert.equal(game.deck.length + game.discard.length + game.players.reduce((sum, p) => sum + p.hand.length, 0), 108);
});

test('un joueur ne peut pas jouer hors de son tour', () => {
  const game = makeTestGame([{ id: 'a' }, { id: 'b' }]);
  assert.throws(() => E.playCard(game, 'b', game.players[1].hand[0].id, 'red'), /pas ton tour/i);
});

test('un +2 peut être cumulé avec un +4 et la pénalité se résout à la pioche', () => {
  const game = makeTestGame([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  const a = game.players[0], b = game.players[1];
  game.turn = 0; game.chosenColor = 'red';
  a.hand = [{ id: 'p2', color: 'red', value: 'draw2', type: 'action' }, { id: 'a-last', color: 'green', value: '8', type: 'number' }];
  b.hand = [{ id: 'w4', color: 'wild', value: 'wild4', type: 'wild' }, { id: 'b-last', color: 'yellow', value: '6', type: 'number' }];
  E.playCard(game, a.id, 'p2');
  assert.equal(game.pendingDraw, 2);
  assert.equal(game.turn, 1);
  E.playCard(game, b.id, 'w4', 'blue');
  assert.equal(game.pendingDraw, 6);
  assert.equal(game.turn, 2);
  const before = game.players[2].hand.length;
  E.drawCard(game, game.players[2].id);
  assert.equal(game.players[2].hand.length, before + 6);
  assert.equal(game.pendingDraw, 0);
  assert.equal(game.turn, 0);
});

test('un joueur peut annoncer UNO après avoir posé son avant-dernière carte', () => {
  const game = makeTestGame([{ id: 'a' }, { id: 'b' }]);
  game.turn = 0; game.chosenColor = 'red';
  game.players[0].hand = [
    { id: 'last', color: 'blue', value: '5', type: 'number' },
    { id: 'play', color: 'red', value: '3', type: 'number' },
  ];
  E.playCard(game, 'a', 'play');
  assert.equal(game.unoPending, 'a');
  E.callUno(game, 'a');
  assert.equal(game.unoPending, null);
  assert.equal(game.players[0].saidUno, true);
});

test('un adversaire peut attraper un UNO oublié et faire piocher deux cartes', () => {
  const game = makeTestGame([{ id: 'a' }, { id: 'b' }]);
  game.turn = 0; game.chosenColor = 'red';
  game.players[0].hand = [
    { id: 'last', color: 'blue', value: '5', type: 'number' },
    { id: 'play', color: 'red', value: '3', type: 'number' },
  ];
  E.playCard(game, 'a', 'play');
  const before = game.players[0].hand.length;
  E.catchUno(game, 'b');
  assert.equal(game.players[0].hand.length, before + 2);
  assert.equal(game.unoPending, null);
});

test('les règles refusent une carte de couleur non jouable', () => {
  const game = makeTestGame([{ id: 'a' }, { id: 'b' }]);
  game.turn = 0;
  const candidate = game.players[0].hand.find(c => c.color !== game.chosenColor && c.type !== 'wild' && c.value !== E.topCard(game).value);
  if (candidate) assert.throws(() => E.playCard(game, 'a', candidate.id), /ne peut pas être jouée/i);
});

test('les mains adverses ne sont pas exposées dans l’état public', () => {
  const game = makeTestGame([{ id: 'a' }, { id: 'b' }]);
  const view = E.publicState(game, 'a');
  assert.ok(Array.isArray(view.players.find(p => p.id === 'a').hand));
  assert.equal(view.players.find(p => p.id === 'b').hand, undefined);
  assert.equal(view.players.find(p => p.id === 'b').count, 7);
});

test('un joueur ne peut piocher qu’une carte avant de jouer ou passer', () => {
  const game = makeTestGame([{ id: 'a' }, { id: 'b' }]);
  game.turn = 0;
  E.drawCard(game, 'a');
  assert.ok(game.drawnCardId);
  assert.throws(() => E.drawCard(game, 'a'), /déjà pioché/i);
});

test('un bot peut jouer immédiatement une carte jouable qu’il vient de piocher', () => {
  const game = makeTestGame([{ id: 'human' }, { id: 'bot', bot: true }]);
  const bot = game.players[1];
  game.turn = 1;
  game.chosenColor = 'red';
  game.discard = [{ id: 'top', color: 'red', value: '7', type: 'number' }];
  bot.hand = [{ id: 'held', color: 'blue', value: '1', type: 'number' }];
  const drawn = { id: 'drawn-playable', color: 'red', value: '5', type: 'number' };
  game.deck = [drawn];
  E.botTurn(game, 'medium');
  assert.equal(E.topCard(game).id, 'drawn-playable');
  assert.equal(bot.hand.length, 1);
  assert.equal(bot.hand[0].id, 'held');
  assert.equal(game.turn, 0);
});
