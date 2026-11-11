// The Autopay gateway (805 D; src/server/payment-providers.js): its
// signatures as its documentation's examples compute them, the payment
// started from the server with the player sent to Autopay's page, its news
// (ITN) believed only with its signature and answered signed, a refund asked
// for once per purchase, and, through the server, an order paid by its news
// and the player brought back from Autopay's page to the shop.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { autopayGateway, autopayHash, xmlLeaves } from '../src/server/payment-providers.js';
import { useServer } from './helpers/server.js';

const base64 = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const itnRequest = (xml) =>
  new Request('https://insightrpg.com/api/payments/notify/autopay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ transactions: base64(xml) }).toString(),
  });

// The documentation's example of an ITN (service 1, key "1test1").
const DOC_ITN = `<?xml version="1.0" encoding="UTF-8"?>
<transactionList><serviceID>1</serviceID><transactions><transaction>
 <orderID>11</orderID><remoteID>91</remoteID><amount>11.11</amount><currency>PLN</currency>
 <gatewayID>1</gatewayID><paymentDate>20010101111111</paymentDate>
 <paymentStatus>SUCCESS</paymentStatus><paymentStatusDetails>AUTHORIZED</paymentStatusDetails>
</transaction></transactions>
<hash>a103bfe581a938e9ad78238cfc674ffafdd6ec70cb6825e7ed5c41787671efe4</hash></transactionList>`;
const DOC_ENV = { AUTOPAY_SERVICE_ID: '1', AUTOPAY_SHARED_KEY: '1test1', AUTOPAY_HOST: 'https://testpay.autopay.eu' };

describe('the Autopay gateway', () => {
  test('signs as the documentation does: values without the empty ones, then the key', async () => {
    assert.equal(await autopayHash(['2', '100', '1.50'], '2test2'), '2ab52e6918c6ad3b69a8228a2ab815f11ad58533eeed963dd990df8d8c3709d1');
    assert.equal(await autopayHash(['2', '100'], '2test2'), '254eac9980db56f425acf8a9df715cbd6f56de3c410b05f05016630f7d30a4ed');
    assert.equal(await autopayHash(['1', '11', 'CONFIRMED'], '1test1'), 'c1e9888b7d9fb988a4aae0dfbff6d8092fc9581e22e02f335367dd01058f9618');
    assert.equal(await autopayHash(['2', '', null, '100', undefined], 'k'), await autopayHash(['2', '100'], 'k'));
  });

  test('is ready only with its service, key and https address', () => {
    assert.equal(autopayGateway.ready(DOC_ENV), true);
    assert.equal(autopayGateway.ready({ ...DOC_ENV, AUTOPAY_SHARED_KEY: '' }), false);
    assert.equal(autopayGateway.ready({ ...DOC_ENV, AUTOPAY_SERVICE_ID: 'abc' }), false);
    assert.equal(autopayGateway.ready({ ...DOC_ENV, AUTOPAY_HOST: 'http://testpay.autopay.eu' }), false);
  });

  test('reads the leaf elements of its XML in order, entities undone', () => {
    assert.deepEqual(xmlLeaves('<a><b>1</b><c x="y">P&amp;Q</c><d></d></a>'), [
      ['b', '1'],
      ['c', 'P&Q'],
      ['d', ''],
    ]);
  });

  test("believes the documentation's ITN, and nothing changed in it or from another service", async () => {
    const notice = await autopayGateway.verify(itnRequest(DOC_ITN), DOC_ENV);
    assert.deepEqual(notice, { orderId: '11', ref: '91', status: 'paid', amount: 1111, currency: 'PLN' });
    await assert.rejects(autopayGateway.verify(itnRequest(DOC_ITN.replace('11.11', '1.11')), DOC_ENV), { status: 401 });
    await assert.rejects(autopayGateway.verify(itnRequest(DOC_ITN), { ...DOC_ENV, AUTOPAY_SERVICE_ID: '2' }), { status: 401 });
    await assert.rejects(autopayGateway.verify(itnRequest('nie xml'), DOC_ENV), { status: 401 });
  });

  test('answers an ITN with the signed confirmation of the documentation', async () => {
    const response = await autopayGateway.answer({ orderId: '11' }, DOC_ENV, true);
    assert.equal(response.status, 200);
    const xml = await response.text();
    assert.match(xml, /<serviceID>1<\/serviceID>.*<orderID>11<\/orderID><confirmation>CONFIRMED<\/confirmation>/s);
    assert.match(xml, /<hash>c1e9888b7d9fb988a4aae0dfbff6d8092fc9581e22e02f335367dd01058f9618<\/hash>/);
    assert.match(await (await autopayGateway.answer({ orderId: '11' }, DOC_ENV, false)).text(), /NOTCONFIRMED/);
  });

  test('starts the payment from the server and gives the page Autopay sends the player to', async () => {
    let sent;
    const page = 'https://testpay.autopay.eu/payment/continue/96VSD39Z6E/L6CGP5BH';
    const fetcher = async (url, init) => {
      sent = { url, init, fields: new URLSearchParams(init.body) };
      const hash = await autopayHash(['PENDING', page, 'abc123', '96VSD39Z6E'], '1test1');
      return new Response(`<transaction><status>PENDING</status><redirecturl>${page}</redirecturl><orderID>abc123</orderID><remoteID>96VSD39Z6E</remoteID><hash>${hash}</hash></transaction>`);
    };
    const validUntil = Date.UTC(2026, 10, 12, 6, 30);
    const payment = await autopayGateway.create(
      { env: DOC_ENV, orderId: 'abc123', amount: 999, currency: 'PLN', points: 500, email: 'gracz@example.com', ip: '203.0.113.7', validUntil },
      fetcher,
    );
    assert.deepEqual(payment, { ref: '96VSD39Z6E', url: page });
    assert.equal(sent.url, 'https://testpay.autopay.eu/payment');
    assert.equal(sent.init.headers.BmHeader, 'pay-bm-continue-transaction-url');
    const fields = [...sent.fields.entries()];
    assert.deepEqual(
      fields.map(([name]) => name),
      ['ServiceID', 'OrderID', 'Amount', 'Description', 'GatewayID', 'Currency', 'CustomerEmail', 'CustomerIP', 'ValidityTime', 'Hash'],
    );
    assert.equal(sent.fields.get('Amount'), '9.99');
    assert.equal(sent.fields.get('Description'), 'Insight - 500 Punktow Systemu');
    // The validity on the Polish clock (CET, an hour ahead in November).
    assert.equal(sent.fields.get('ValidityTime'), '2026-11-12 07:30:00');
    assert.equal(sent.fields.get('Hash'), await autopayHash(fields.slice(0, -1).map(([, value]) => value), '1test1'));
  });

  test('refuses a start Autopay did not sign or did not take', async () => {
    const answerWith = (text) => async () => new Response(text);
    const order = { env: DOC_ENV, orderId: 'abc123', amount: 499, currency: 'PLN', points: 250 };
    await assert.rejects(
      autopayGateway.create(order, answerWith('<transaction><status>PENDING</status><redirecturl>https://evil.example/x</redirecturl><orderID>abc123</orderID><remoteID>R1</remoteID><hash>00</hash></transaction>')),
      { status: 502 },
    );
    await assert.rejects(autopayGateway.create(order, answerWith('<error><statusCode>400</statusCode><name>X</name><description>Bad</description></error>')), { status: 502 });
    await assert.rejects(
      autopayGateway.create(order, async () => {
        throw new Error('offline');
      }),
      { status: 502 },
    );
  });

  test('asks for a whole refund with the payment number, the same message for the same purchase', async () => {
    const messages = [];
    const fetcher = async (url, init) => {
      const fields = new URLSearchParams(init.body);
      messages.push({ url, fields });
      const hash = await autopayHash(['1', fields.get('MessageID')], '1test1');
      return new Response(`<transactionRefund><serviceID>1</serviceID><messageID>${fields.get('MessageID')}</messageID><hash>${hash}</hash></transactionRefund>`);
    };
    const refund = { env: DOC_ENV, ref: '96VSD39Z6E', orderId: 'abc123', amount: 999, currency: 'PLN' };
    assert.deepEqual(await autopayGateway.refund(refund, fetcher), { ok: true, done: false });
    await autopayGateway.refund(refund, fetcher);
    assert.equal(messages[0].url, 'https://testpay.autopay.eu/settlementapi/transactionRefund');
    assert.deepEqual([...messages[0].fields.keys()], ['ServiceID', 'MessageID', 'RemoteID', 'Hash']);
    assert.match(messages[0].fields.get('MessageID'), /^[0-9a-f]{32}$/);
    assert.equal(messages[1].fields.get('MessageID'), messages[0].fields.get('MessageID'));
    assert.equal(messages[0].fields.get('Hash'), await autopayHash(['1', messages[0].fields.get('MessageID'), '96VSD39Z6E'], '1test1'));
    assert.deepEqual(await autopayGateway.refund(refund, async () => new Response('<error><description>Brak salda</description></error>')), { ok: false, done: false });
  });
});

describe('payments through Autopay, on the server', () => {
  const KEY = 'klucz-testowy-autopay';
  const { server, call, db, signUp } = useServer({ PAYMENTS: 'autopay', AUTOPAY_SERVICE_ID: '123456', AUTOPAY_SHARED_KEY: KEY, AUTOPAY_HOST: 'https://testpay.autopay.eu' });

  async function itn(orderId, { amount = '4.99', status = 'SUCCESS', key = KEY, remoteId = 'R2X9' } = {}) {
    const values = ['123456', orderId, remoteId, amount, 'PLN', '509', '20261111083000', status, 'AUTHORIZED'];
    const hash = await autopayHash(values, key);
    const xml = `<?xml version="1.0" encoding="UTF-8"?><transactionList><serviceID>123456</serviceID><transactions><transaction><orderID>${orderId}</orderID><remoteID>${remoteId}</remoteID><amount>${amount}</amount><currency>PLN</currency><gatewayID>509</gatewayID><paymentDate>20261111083000</paymentDate><paymentStatus>${status}</paymentStatus><paymentStatusDetails>AUTHORIZED</paymentStatusDetails></transaction></transactions><hash>${hash}</hash></transactionList>`;
    const response = await server.fetch('/api/payments/notify/autopay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://testpay.autopay.eu' },
      body: new URLSearchParams({ transactions: base64(xml) }).toString(),
    });
    return { status: response.status, text: await response.text() };
  }

  test("Autopay's signed news pays the order once, and forged news is refused", async () => {
    const { cookie } = await signUp('kupiec');
    await call('POST', '/api/character', { cookie, body: { name: 'Kupiec', classId: 'warrior', appearance: 'male' } });
    const database = await db();
    const character = await database.prepare("SELECT id, user_id FROM characters WHERE name = 'Kupiec'").first();
    await database
      .prepare(
        `INSERT INTO purchases (public_id, user_id, character_id, pack_id, points, price, currency, provider, provider_ref, status, consents, created_at)
         VALUES ('a1b2c3', ?, ?, 'ps-250', 250, 499, 'PLN', 'autopay', 'R1START', 'pending', '{}', ?)`,
      )
      .bind(character.user_id, character.id, Date.now())
      .run();
    const forged = await itn('a1b2c3', { key: 'zly-klucz' });
    assert.equal(forged.status, 401);
    const paid = await itn('a1b2c3');
    assert.equal(paid.status, 200);
    assert.match(paid.text, /<orderID>a1b2c3<\/orderID><confirmation>CONFIRMED<\/confirmation>/);
    assert.match(paid.text, new RegExp(`<hash>${await autopayHash(['123456', 'a1b2c3', 'CONFIRMED'], KEY)}</hash>`));
    await itn('a1b2c3');
    const points = await database.prepare('SELECT system_points, system_points_paid FROM characters WHERE id = ?').bind(character.id).first();
    assert.equal(points.system_points_paid, 250);
    const purchase = await database.prepare("SELECT status, provider_ref FROM purchases WHERE public_id = 'a1b2c3'").first();
    // The payment that succeeded is the one a refund needs.
    assert.deepEqual(purchase, { status: 'paid', provider_ref: 'R2X9' });
    // News of an order nobody made is not confirmed.
    assert.match((await itn('ffff')).text, /NOTCONFIRMED/);
  });

  test('the player comes back from Autopay to the shop page of the points', async () => {
    const response = await server.fetch('/api/payments/return?ServiceID=123456&OrderID=a1b2c3&Hash=x', { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('Location'), /\/#\/sklep\/punkty$/);
  });
});
