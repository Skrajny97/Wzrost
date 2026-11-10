// A member sent on a Drużyna's trip sees it on its own page (the author,
// 10.11.2026: „czasem robi sie błąd i nie pokazuje jednemu z graczy ze jest
// na wyprawie mimo ze jest drużynowo”). The cause: the page learns of what
// happened to its character elsewhere only from the chat's check, which
// tells its activity's end (src/server/chat.js, latestChat), and before the
// fix it fetched the character again only when it showed a trip already, so
// a member at home, or back with its report waiting, stayed so on its own
// screen when the leader sent the party out (src/client/app.js,
// onActivityEnds). Now any end other than the one the page shows makes it
// fetch the character (src/client/activity-sync.js).

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { activityMoved } from '../src/client/activity-sync.js';
import { useServer } from './helpers/server.js';

describe('the page follows its character\'s activity', () => {
  test('any end other than the one the page shows makes it fetch the character', () => {
    // The bug: at home on its page, sent out by the leader.
    assert.equal(activityMoved(null, 1800000), true);
    // Back from its own exploration, its report claimed as the party set out.
    assert.equal(activityMoved({ kind: 'hunt', endsAt: 1000 }, 1800000), true);
    // A trip moved by another member's "Przewiń", as before.
    assert.equal(activityMoved({ kind: 'hunt', endsAt: 1800000, party: { names: ['A', 'B'] } }, 1200000), true);
    // A report claimed on another device.
    assert.equal(activityMoved({ kind: 'hunt', endsAt: 1000 }, null), true);
    // Nothing new.
    assert.equal(activityMoved({ kind: 'hunt', endsAt: 1000 }, 1000), false);
    assert.equal(activityMoved(null, null), false);
    assert.equal(activityMoved(null, undefined), false);
  });
});

describe('the chat\'s check tells a member the trip it was sent on', () => {
  const { call, db, signUp } = useServer();
  const cookies = {};
  const player = async (login, name) => {
    ({ cookie: cookies[login] } = await signUp(login));
    await call('POST', '/api/character', { cookie: cookies[login], body: { name, classId: 'warrior', appearance: 'female' } });
    await (await db()).prepare('UPDATE characters SET level = 30, class_level = 30 WHERE name = ?').bind(name).run();
  };
  const as = (login, method, path, body) => call(method, path, { cookie: cookies[login], body });

  beforeEach(async () => {
    await player('lider', 'Lider');
    await player('druh', 'Druh');
    const { data } = await as('lider', 'POST', '/api/party/invite', { name: 'Druh' });
    await as('druh', 'POST', '/api/party/accept', { partyId: data.party.id });
  });

  test('a member at home: its page, showing it at home, hears the trip and fetches it', async () => {
    const page = (await as('druh', 'GET', '/api/character')).data.character;
    assert.equal(page.activity, null);
    assert.equal((await as('druh', 'GET', '/api/chat/latest')).data.activityEndsAt, null);
    assert.equal(activityMoved(page.activity, null), false);
    const went = await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 });
    assert.deepEqual(went.data.went, ['Druh']);
    const heard = (await as('druh', 'GET', '/api/chat/latest')).data.activityEndsAt;
    assert.ok(heard > 0);
    assert.equal(activityMoved(page.activity, heard), true);
    const fetched = (await as('druh', 'GET', '/api/character')).data.character;
    assert.equal(fetched.activity.kind, 'hunt');
    assert.equal(fetched.activity.endsAt, heard);
    assert.deepEqual(fetched.activity.party.names, ['Lider', 'Druh']);
    assert.equal(activityMoved(fetched.activity, heard), false);
  });

  test('a member back from its own exploration: the trip after its report, not the report, is what it hears', async () => {
    assert.equal((await as('druh', 'POST', '/api/hunts', { areaId: 'windfalls-edge', minutes: 5 })).status, 201);
    await (await db()).prepare("UPDATE activities SET started_at = started_at - 600000, ends_at = ends_at - 600000 WHERE character_id = (SELECT id FROM characters WHERE name = 'Druh')").run();
    const page = (await as('druh', 'GET', '/api/character')).data.character;
    assert.equal(page.activity.party, undefined);
    assert.deepEqual((await as('lider', 'POST', '/api/party/hunt', { areaId: 'windfalls-edge', minutes: 30 })).data.went, ['Druh']);
    const heard = (await as('druh', 'GET', '/api/chat/latest')).data.activityEndsAt;
    assert.notEqual(heard, page.activity.endsAt);
    assert.equal(activityMoved(page.activity, heard), true);
  });
});
