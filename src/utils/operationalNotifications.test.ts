import { buildOperationalNotifications } from './operationalNotifications.js';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

const notifications = buildOperationalNotifications([
  {
    id: 'runner-1',
    botId: 'bot-1',
    pair: 'BTC/USDT',
    status: 'paused',
    recoveryState: 'ORDER_STATUS_UNCERTAIN',
    recoveryMessage: 'Order belum dapat dipastikan.',
  },
  {
    id: 'runner-2',
    botId: 'bot-2',
    pair: 'ETH/USDT',
    status: 'active',
    recoveryState: 'HEALTHY',
  },
], 2, 1700000000000);

assert(notifications.length === 2, 'two operational notices expected when a blocker exists');
assert(notifications[0]?.severity === 'critical', 'uncertain order should be critical');
assert(notifications[0]?.kind === 'order', 'uncertain order should use order kind');
assert(notifications[0]?.pair === 'BTC/USDT', 'uncertain order should carry pair');
assert(notifications[1]?.kind === 'price', 'active price alert should be included');
assert(notifications[1]?.severity === 'info', 'price alert should be informational');

const healthyOnly = buildOperationalNotifications([
  { id: 'runner-3', pair: 'SOL/USDT', status: 'active', recoveryState: 'HEALTHY' },
], 0, 1700000000000);
assert(healthyOnly.length === 1, 'healthy state should emit one system notice');
assert(healthyOnly[0]?.severity === 'success', 'healthy notice should be success');
assert(healthyOnly[0]?.id === 'system-runtime-healthy', 'healthy notice id should be stable');

console.log('operationalNotifications tests: PASS');
