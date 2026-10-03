import 'dotenv/config';

const { dbQuery, dbTransaction, finalizeOrderWithFill } =
  await import('./src/server/database.ts');

async function main() {
  const suffix = Date.now().toString();

  const userId = crypto.randomUUID();
  const botId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const clientOrderId = `e2e-concurrency-${suffix}`;
  const exchangeOrderId = `e2e-concurrency-exchange-${suffix}`;

  console.log('===== CREATE TEST DATA =====');
  console.log('userId =', userId);
  console.log('botId  =', botId);
  console.log('orderId =', orderId);

  try {
    await dbQuery(
      `INSERT INTO users
       (id, firebase_uid, status, created_at, updated_at)
       VALUES ($1, $2, 'active', NOW(), NOW())`,
      [userId, `e2e-concurrency-${suffix}`],
    );

    await dbQuery(
      `INSERT INTO bots
       (id, user_id, name, symbol, strategy_type, status, mode, created_at, updated_at)
       VALUES ($1, $2, $3, 'BTC/USDT', 'E2E', 'ACTIVE', 'TESTNET', NOW(), NOW())`,
      [botId, userId, `E2E Concurrency ${suffix}`],
    );

    await dbQuery(
      `INSERT INTO orders
       (
         id,
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
         status,
         exchange_order_id,
         created_at,
         updated_at
       )
       VALUES
       (
         $1, $2, $3, $4,
         'binance',
         'BTC/USDT',
         'buy',
         'market',
         1.5,
         100,
         150,
         'open',
         $5,
         NOW(),
         NOW()
       )`,
      [
        orderId,
        clientOrderId,
        botId,
        userId,
        exchangeOrderId,
      ],
    );

    console.log('\n===== CONCURRENT CALLS =====');

    const input = {
      orderId,
      exchangeOrderId,
      quantity: 1.5,
      price: 100,
      quoteAmount: 150,
      feeAmount: 0.15,
      feeAsset: 'USDT',
    };

    const [resultA, resultB] = await Promise.allSettled([
      finalizeOrderWithFill(input),
      finalizeOrderWithFill(input),
    ]);

    console.log('\nCALL A:');
    console.dir(resultA, { depth: null });

    console.log('\nCALL B:');
    console.dir(resultB, { depth: null });

    const successful = [resultA, resultB].filter(
      (r) => r.status === 'fulfilled',
    ) as PromiseFulfilledResult<any>[];

    const failed = [resultA, resultB].filter(
      (r) => r.status === 'rejected',
    );

    if (failed.length > 0) {
      throw new Error(
        `One or more concurrent settlements rejected: ${JSON.stringify(
          failed,
          null,
          2,
        )}`,
      );
    }

    const replayCount = successful.filter(
      (r) => r.value.replayed === true,
    ).length;

    const appliedCount = successful.filter(
      (r) => r.value.replayed === false,
    ).length;

    if (appliedCount !== 1 || replayCount !== 1) {
      throw new Error(
        `Expected exactly 1 applied + 1 replay, got applied=${appliedCount}, replay=${replayCount}`,
      );
    }

    console.log('\n===== VERIFY DATABASE =====');

    const fills = await dbQuery(
      `SELECT
         COUNT(*)::text AS count,
         COALESCE(SUM(quantity), 0)::text AS quantity,
         COALESCE(SUM(quote_amount), 0)::text AS quote,
         COALESCE(SUM(fee_amount), 0)::text AS fee
       FROM fills
       WHERE order_id = $1`,
      [orderId],
    );

    const position = await dbQuery(
      `SELECT
         quantity::text AS quantity,
         average_entry::text AS average_entry,
         total_fees::text AS total_fees
       FROM positions
       WHERE bot_id = $1
         AND symbol = 'BTC/USDT'`,
      [botId],
    );

    const order = await dbQuery(
      `SELECT
         status,
         exchange_order_id
       FROM orders
       WHERE id = $1`,
      [orderId],
    );

    console.log('fills:', fills.rows[0]);
    console.log('position:', position.rows[0]);
    console.log('order:', order.rows[0]);

    const fillRow = fills.rows[0];
    const positionRow = position.rows[0];
    const orderRow = order.rows[0];

    if (fillRow.count !== '1') {
      throw new Error(`Expected exactly 1 fill row, got ${fillRow.count}`);
    }

    if (Number(fillRow.quantity) !== 1.5) {
      throw new Error(
        `Expected fill quantity 1.5, got ${fillRow.quantity}`,
      );
    }

    if (Number(fillRow.quote) !== 150) {
      throw new Error(
        `Expected fill quote 150, got ${fillRow.quote}`,
      );
    }

    if (Number(fillRow.fee) !== 0.15) {
      throw new Error(
        `Expected fill fee 0.15, got ${fillRow.fee}`,
      );
    }

    if (!positionRow) {
      throw new Error('Expected position row to exist');
    }

    if (Number(positionRow.quantity) !== 1.5) {
      throw new Error(
        `Expected position quantity 1.5, got ${positionRow.quantity}`,
      );
    }

    if (Number(positionRow.average_entry) !== 100) {
      throw new Error(
        `Expected average entry 100, got ${positionRow.average_entry}`,
      );
    }

    if (Number(positionRow.total_fees) !== 0.15) {
      throw new Error(
        `Expected total fees 0.15, got ${positionRow.total_fees}`,
      );
    }

    if (orderRow.status !== 'filled') {
      throw new Error(
        `Expected order status filled, got ${orderRow.status}`,
      );
    }

    console.log('\n========================================');
    console.log('E2E FILL CONCURRENCY TEST: PASSED');
    console.log('========================================');
    console.log('Concurrent calls      : 2');
    console.log('Applied settlements   : 1');
    console.log('Replay settlements    : 1');
    console.log('Expected fill rows    : 1');
    console.log('Actual fill rows      :', fillRow.count);
    console.log('Expected position qty : 1.5');
    console.log('Actual position qty   :', positionRow.quantity);
    console.log('========================================');
  } finally {
    console.log('\n===== CLEANUP TEST DATA =====');

    await dbQuery(`DELETE FROM fills WHERE order_id = $1`, [orderId]);
    await dbQuery(`DELETE FROM positions WHERE bot_id = $1`, [botId]);
    await dbQuery(`DELETE FROM orders WHERE id = $1`, [orderId]);
    await dbQuery(`DELETE FROM bots WHERE id = $1`, [botId]);
    await dbQuery(`DELETE FROM users WHERE id = $1`, [userId]);

    const leftovers = await dbQuery(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE id = $1)::text AS users,
         (SELECT COUNT(*) FROM bots WHERE id = $2)::text AS bots`,
      [userId, botId],
    );

    console.log('Cleanup selesai.');
    console.log('Remaining test users:', leftovers.rows[0].users);
    console.log('Remaining test bots :', leftovers.rows[0].bots);
  }
}

main().catch((error) => {
  console.error('\nE2E TEST FAILED');
  console.error(error);
  process.exitCode = 1;
});
