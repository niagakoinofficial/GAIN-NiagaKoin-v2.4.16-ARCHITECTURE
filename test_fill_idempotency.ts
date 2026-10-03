import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { dbQuery, dbTransaction, finalizeOrderWithFill } from './src/server/database.ts';

const suffix = Date.now().toString();
const firebaseUid = `e2e-fill-${suffix}`;
const clientOrderId = `e2e-fill-order-${suffix}`;
const exchangeOrderId = `e2e-exchange-${suffix}`;
const externalBotId = `e2e-bot-${suffix}`;
const symbol = 'TEST/USDT';

let userId: string | null = null;
let botId: string | null = null;
let orderId: string | null = null;

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function cleanup() {
  if (!userId && !botId && !orderId) return;

  await dbTransaction(async (client) => {
    if (orderId) {
      await client.query(
        `DELETE FROM fills WHERE order_id = $1`,
        [orderId],
      );

      await client.query(
        `DELETE FROM orders WHERE id = $1`,
        [orderId],
      );
    }

    if (botId) {
      await client.query(
        `DELETE FROM positions WHERE bot_id = $1`,
        [botId],
      );

      await client.query(
        `DELETE FROM bots WHERE id = $1`,
        [botId],
      );
    }

    if (userId) {
      await client.query(
        `DELETE FROM users WHERE id = $1`,
        [userId],
      );
    }
  });
}

async function main() {
  try {
    console.log('===== CREATE TEST DATA =====');

    const user = await dbQuery<any>(
      `INSERT INTO users
        (firebase_uid, status, email)
       VALUES ($1, 'active', $2)
       RETURNING id`,
      [
        firebaseUid,
        `${firebaseUid}@example.invalid`,
      ],
    );

    userId = user.rows[0].id;

    const bot = await dbQuery<any>(
      `INSERT INTO bots
        (user_id, name, symbol, strategy_type, status, mode, external_bot_id)
       VALUES ($1, $2, $3, 'e2e', 'PAUSED', 'TEST', $4)
       RETURNING id`,
      [
        userId,
        `E2E Fill Test ${suffix}`,
        symbol,
        externalBotId,
      ],
    );

    botId = bot.rows[0].id;

    const order = await dbQuery<any>(
      `INSERT INTO orders
        (
          client_order_id,
          bot_id,
          user_id,
          exchange,
          symbol,
          side,
          order_type,
          requested_qty,
          requested_price,
          expected_notional,
          status
        )
       VALUES
        ($1, $2, $3, 'e2e', $4, 'buy', 'market', 1.5, 100, 150, 'submitted')
       RETURNING id`,
      [
        clientOrderId,
        botId,
        userId,
        symbol,
      ],
    );

    orderId = order.rows[0].id;

    if (!orderId) {
      throw new Error('E2E setup failed: orderId was not created');
    }

    console.log(`userId = ${userId}`);
    console.log(`botId  = ${botId}`);
    console.log(`orderId = ${orderId}`);

    console.log('\n===== CALL 1: cumulative 1.0 =====');

    const r1 = await finalizeOrderWithFill({
      orderId,
      exchangeOrderId,
      quantity: 1.0,
      price: 100,
      quoteAmount: 100,
      feeAmount: 0.10,
      feeAsset: 'USDT',
    });

    console.log(r1);

    assert(r1.replayed === false, 'first settlement must not be replayed');
    assert(Math.abs(Number(r1.deltaQuantity) - 1.0) < 1e-9,
      'first delta must equal 1.0');

    console.log('\n===== CALL 2: replay cumulative 1.0 =====');

    const r2 = await finalizeOrderWithFill({
      orderId,
      exchangeOrderId,
      quantity: 1.0,
      price: 100,
      quoteAmount: 100,
      feeAmount: 0.10,
      feeAsset: 'USDT',
    });

    console.log(r2);

    assert(r2.replayed === true, 'same cumulative fill must be replayed');
    assert(Number(r2.deltaQuantity) === 0,
      'replay delta must be zero');

    console.log('\n===== CALL 3: cumulative 1.5 =====');

    const r3 = await finalizeOrderWithFill({
      orderId,
      exchangeOrderId,
      quantity: 1.5,
      price: 100,
      quoteAmount: 150,
      feeAmount: 0.15,
      feeAsset: 'USDT',
    });

    console.log(r3);

    assert(r3.replayed === false, 'new cumulative quantity must settle');
    assert(Math.abs(Number(r3.deltaQuantity) - 0.5) < 1e-9,
      'second settlement delta must equal 0.5');

    console.log('\n===== CALL 4: replay cumulative 1.5 =====');

    const r4 = await finalizeOrderWithFill({
      orderId,
      exchangeOrderId,
      quantity: 1.5,
      price: 100,
      quoteAmount: 150,
      feeAmount: 0.15,
      feeAsset: 'USDT',
    });

    console.log(r4);

    assert(r4.replayed === true, 'final replay must be replayed');
    assert(Number(r4.deltaQuantity) === 0,
      'final replay delta must be zero');

    console.log('\n===== VERIFY DATABASE =====');

    const fills = await dbQuery<any>(
      `SELECT
          COUNT(*) AS count,
          COALESCE(SUM(quantity), 0) AS quantity,
          COALESCE(SUM(quote_amount), 0) AS quote,
          COALESCE(SUM(fee_amount), 0) AS fee
       FROM fills
       WHERE order_id = $1`,
      [orderId],
    );

    const position = await dbQuery<any>(
      `SELECT
          quantity,
          average_entry,
          realized_pnl,
          total_fees
       FROM positions
       WHERE bot_id = $1
         AND symbol = $2`,
      [botId, symbol],
    );

    const finalOrder = await dbQuery<any>(
      `SELECT
          status,
          exchange_order_id
       FROM orders
       WHERE id = $1`,
      [orderId],
    );

    console.log('fills:', fills.rows[0]);
    console.log('position:', position.rows[0]);
    console.log('order:', finalOrder.rows[0]);

    assert(Number(fills.rows[0].count) === 2,
      'exactly 2 fill ledger rows expected');

    assert(Math.abs(Number(fills.rows[0].quantity) - 1.5) < 1e-9,
      'fill ledger total quantity must equal 1.5');

    assert(Math.abs(Number(fills.rows[0].quote) - 150) < 1e-9,
      'fill ledger total quote must equal 150');

    assert(Math.abs(Number(fills.rows[0].fee) - 0.15) < 1e-9,
      'fill ledger total fee must equal 0.15');

    assert(position.rows.length === 1,
      'exactly one position expected');

    assert(Math.abs(Number(position.rows[0].quantity) - 1.5) < 1e-9,
      'position quantity must equal 1.5');

    assert(Math.abs(Number(position.rows[0].average_entry) - 100) < 1e-9,
      'average entry must equal 100');

    assert(Math.abs(Number(position.rows[0].total_fees) - 0.15) < 1e-9,
      'position fees must equal 0.15');

    assert(finalOrder.rows[0]?.status === 'filled',
      'order must finish filled');

    assert(
      String(finalOrder.rows[0]?.exchange_order_id) === exchangeOrderId,
      'exchange order id must match',
    );

    console.log('\n========================================');
    console.log('E2E FILL IDEMPOTENCY TEST: PASSED');
    console.log('========================================');
    console.log('Expected position quantity : 1.5');
    console.log('Actual position quantity   :', position.rows[0].quantity);
    console.log('Expected fill rows         : 2');
    console.log('Actual fill rows           :', fills.rows[0].count);
    console.log('Expected total fee         : 0.15');
    console.log('Actual total fee           :', fills.rows[0].fee);
    console.log('========================================');

  } finally {
    console.log('\n===== CLEANUP TEST DATA =====');

    await cleanup();

    console.log('Cleanup selesai.');

    const leftovers = await dbQuery<any>(
      `SELECT
          (SELECT COUNT(*) FROM users WHERE firebase_uid = $1) AS users,
          (SELECT COUNT(*) FROM bots WHERE external_bot_id = $2) AS bots`,
      [firebaseUid, externalBotId],
    );

    console.log('Remaining test users:', leftovers.rows[0].users);
    console.log('Remaining test bots :', leftovers.rows[0].bots);
  }
}

main().catch((error) => {
  console.error('\nE2E TEST FAILED');
  console.error(error);
  process.exitCode = 1;
});
