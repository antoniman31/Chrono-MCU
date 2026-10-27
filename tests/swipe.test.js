import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swipeAction, SWIPE_RATIO } from '../js/ui/swipe.js';

const both = { right: true, left: true };

test('swipeAction: sous le seuil, rien ne se passe', () => {
  assert.equal(SWIPE_RATIO, 0.4);
  assert.equal(swipeAction(100, 400, both), null);
  assert.equal(swipeAction(-159, 400, both), null);
  assert.equal(swipeAction(0, 400, both), null);
});

test('swipeAction: au seuil et au-delà, le sens donne l\'action', () => {
  assert.equal(swipeAction(160, 400, both), 'right');
  assert.equal(swipeAction(300, 400, both), 'right');
  assert.equal(swipeAction(-160, 400, both), 'left');
});

test('swipeAction: un sens désactivé ne valide jamais', () => {
  assert.equal(swipeAction(300, 400, { right: false, left: true }), null);
  assert.equal(swipeAction(-300, 400, { right: true, left: false }), null);
  assert.equal(swipeAction(300, 400, {}), null);
});

test('swipeAction: largeur nulle sans effet', () => {
  assert.equal(swipeAction(100, 0, both), null);
});
