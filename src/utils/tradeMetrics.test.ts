import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTradeMetrics, decorateTradesWithRealizedPnl } from './tradeMetrics';

test('trade metrics use FIFO realized PnL and do not fake 100% wins', () => {
  const trades: any[] = [
    { id: '1', symbol: 'BTC/USDT', side: 'buy', price: 100, amount: 1, costUsdt: 100, timestamp: 1, status: 'filled' },
    { id: '2', symbol: 'BTC/USDT', side: 'sell', price: 110, amount: 1, costUsdt: 110, timestamp: 2, status: 'filled' },
    { id: '3', symbol: 'ETH/USDT', side: 'buy', price: 100, amount: 1, costUsdt: 100, timestamp: 3, status: 'filled' },
  ];
  const metrics = calculateTradeMetrics(trades);
  assert.equal(metrics.buyCount, 2);
  assert.equal(metrics.sellCount, 1);
  assert.equal(metrics.realizedTradeCount, 1);
  assert.equal(metrics.winRate, '100.0');
  assert.equal(metrics.totalRealizedPnl, 10);
});

test('trade metrics show dash when there are no closed sells', () => {
  const metrics = calculateTradeMetrics([{ id: '1', symbol: 'BTC/USDT', side: 'buy', price: 100, amount: 1, costUsdt: 100, timestamp: 1, status: 'filled' }] as any);
  assert.equal(metrics.winRate, '—');
  assert.equal(metrics.realizedTradeCount, 0);
});

test('decorate trades adds realized pnl to a sell', () => {
  const decorated = decorateTradesWithRealizedPnl([
    { id: '1', symbol: 'BTC/USDT', side: 'buy', price: 100, amount: 1, costUsdt: 100, timestamp: 1, datetime: '', status: 'filled', exchange: 'BINANCE', type: 'market' },
    { id: '2', symbol: 'BTC/USDT', side: 'sell', price: 125, amount: 1, costUsdt: 125, timestamp: 2, datetime: '', status: 'filled', exchange: 'BINANCE', type: 'market' },
  ] as any);
  assert.equal(decorated[1].realizedPnl, 25);
});
