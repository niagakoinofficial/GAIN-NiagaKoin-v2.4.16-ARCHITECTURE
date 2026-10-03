import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDcaLayers } from './engines/strategy/DcaEngine';
import { generateGridLevels } from './engines/strategy/GridEngine';
import { evaluateRisk } from './engines/risk/RiskEngine';

test('DCA layer planner applies step scale and volume multiplier under capital cap', () => {
  const layers = generateDcaLayers({ baseOrderUsd: 10, stepDeviationPct: 2, stepScale: 1.25, volumeMultiplier: 1.5, maxLayers: 20, maxCapitalUsd: 100, takeProfitPct: 1, trailingTpPct: .2, callbackPct: .2 });
  assert.equal(layers[0].amountUsd, 10);
  assert.equal(layers[1].amountUsd, 15);
  assert.equal(layers[1].deviationPct, 2);
  assert.ok(layers.reduce((s, l) => s + l.amountUsd, 0) <= 100);
});

test('Grid planner creates bounded levels', () => {
  const levels = generateGridLevels({ lowerPrice: 80, upperPrice: 120, gridCount: 20, orderSizeUsd: 10, takeProfitPct: 1, maxCapitalUsd: 200 });
  assert.equal(levels.length, 21);
  assert.equal(levels[0].price, 80);
  assert.equal(levels.at(-1)?.price, 120);
});

test('risk engine blocks committed capital and spread violations', () => {
  const intent = { id:'1', idempotencyKey:'1', botId:'b', userId:'u', strategy:'DCA' as const, symbol:'BTC/USDT', side:'buy' as const, type:'market' as const, quantity:0.01, referencePrice:100, notional:1, reason:'test', createdAt:Date.now() };
  const market = { exchange:'binance', symbol:'BTC/USDT', bid:99, ask:101, last:100, timestamp:Date.now(), spreadPct:2 };
  const decision = evaluateRisk(intent, market, { botExposureUsd:0,userExposureUsd:0,portfolioExposureUsd:0,futureCommittedUsd:100,maxOrderUsd:50,maxBotExposureUsd:250,maxUserExposureUsd:500,maxPortfolioExposureUsd:1000,maxCommittedCapitalUsd:100,maxDailyLossUsd:25,dailyNetPnlUsd:0,maxDrawdownPct:20,drawdownPct:0,maxSpreadPct:1,maxSlippagePct:1,marketPriceTimestamp:Date.now(),now:Date.now(),killSwitch:false,exchangeHealthy:true });
  assert.equal(decision.approved, false);
  assert.equal('code' in decision ? decision.code : 'APPROVED', 'SPREAD_TOO_HIGH');
});
