import assert from 'node:assert/strict';
import test from 'node:test';
import { EXCHANGE_REGISTRY, getExchangeDescriptor, getExchangeNames, isTradingExchange } from './exchangeRegistry';

test('exchange registry contains requested exchanges', () => {
  for (const id of ['binance', 'bitget', 'okx', 'bybit', 'indodax', 'tokocrypto', 'reku', 'triv']) {
    assert.ok(getExchangeDescriptor(id), `missing ${id}`);
  }
});

test('Bitget is fully certifiable with sandbox trading capability', () => {
  const bitget = getExchangeDescriptor('bitget');
  assert.equal(bitget?.hasOfficialSandbox, true);
  assert.equal(bitget?.tradingApi, true);
  assert.equal(bitget?.requiresPassphrase, true);
});

test('Reku remains read-only until authenticated trading contract is verified', () => {
  const reku = getExchangeDescriptor('reku');
  assert.equal(reku?.publicOnly, true);
  assert.equal(reku?.tradingApi, false);
  assert.equal(reku?.certificationMode, 'READ_ONLY');
});

test('Triv does not expose a fabricated trading adapter', () => {
  const triv = getExchangeDescriptor('triv');
  assert.equal(triv?.tradingApi, false);
  assert.equal(triv?.certificationMode, 'BLOCKED_PENDING_NATIVE_API');
  assert.equal(isTradingExchange('triv'), false);
});

test('Pintu Pro remains blocked until a native API contract is verified', () => {
  const pintu = getExchangeDescriptor('pintupro');
  assert.equal(pintu?.publicOnly, true);
  assert.equal(pintu?.tradingApi, false);
  assert.equal(pintu?.certificationMode, 'BLOCKED_PENDING_NATIVE_API');
});

test('registry names map one-to-one with IDs', () => {
  assert.equal(getExchangeNames().length, EXCHANGE_REGISTRY.length);
  assert.equal(new Set(getExchangeNames()).size, EXCHANGE_REGISTRY.length);
});

test('registry IDs are unique', () => {
  const ids = EXCHANGE_REGISTRY.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});
