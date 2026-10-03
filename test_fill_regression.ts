import 'dotenv/config';

const { dbQuery, finalizeOrderWithFill } =
  await import('./src/server/database.ts');

async function main() {
  const suffix = Date.now().toString();

  const userId = crypto.randomUUID();
  const botId = crypto.randomUUID();
  const orderId = crypto.randomUUID();

  const exchangeOrderId = `e2e-regression-${suffix}`;

  console.log('===== CREATE TEST DATA =====');
  console.log('userId  =', userId);
  console.log('botId   =', botId);
  console.log('orderId =', orderId);

  try {
    await dbQuery(
      `INSERT INTO users
       (id, firebase_uid, status, created_at, updated_at)
       VALUES ($1, $2, 'active', NOW(), NOW())`,
      [userId, `e2e-regression-${suffix}`],
    );

    await dbQuery(
      `INSERT INTO bots
       (id, user_id, name, symbol, strategy_type, status, mode, created_at, updated_at)
       VALUES ($1, $2, $3, 'BTC/USDT', 'E2E', 'ACTIVE', 'TESTNET', NOW(), NOW())`,
      [botId, userId, `E2E Regression ${suffix}`],
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
        `e2e-regression-client-${suffix}`,
        botId,
        userId,
        exchangeOrderId,
      ],
    );

    console.log('\n===== CALL 1: cumulative 1.5 =====');

    const first = await finalizeOrderWithFill({
      orderId,
      exchangeOrderId,
      quantity: 1.5,
      price: 100,
      quoteAmount: 150,
      feeAmount: 0.15,
      feeAsset: 'USDT',
    });

    console.log(first);

    if (first.replayed) {
      throw new Error('Initial settlement unexpectedly marked as replay');
    }

    console.log('\n===== SNAPSHOT BEFORE REGRESSION =====');

    const before = await dbQuery(
      `SELECT
         (SELECT COUNT(*)::text
            FROM fills
           WHERE order_id = $1) AS fill_count,
         (SELECT COALESCE(SUM(quantity), 0)::text
            FROM fills
           WHERE order_id = $1) AS fill_quantity,
         (SELECT COALESCE(SUM(quote_amount), 0)::text
            FROM fills
           WHERE order_id = $1) AS fill_quote,
         (SELECT COALESCE(SUM(fee_amount), 0)::text
            FROM fills
           WHERE order_id = $1) AS fill_fee,
         (SELECT quantity::text
            FROM positions
           WHERE bot_id = $2
             AND symbol = 'BTC/USDT') AS position_quantity,
         (SELECT total_fees::text
            FROM positions
           WHERE bot_id = $2
             AND symbol = 'BTC/USDT') AS position_fees,
         (SELECT status
            FROM orders
           WHERE id = $3) AS order_status`,
      [orderId, botId, orderId],
    );

    console.log(before.rows[0]);

    console.log('\n===== CALL 2: REGRESSION cumulative 1.0 =====');

    let regressionRejected = false;

    try {
      await finalizeOrderWithFill({
        orderId,
        exchangeOrderId,
        quantity: 1.0,
        price: 100,
        quoteAmount: 100,
        feeAmount: 0.10,
        feeAsset: 'USDT',
      });
    } catch (error) {
      regressionRejected = true;

      console.log('Regression correctly rejected:');
      console.log(error instanceof Error ? error.message : error);
    }

    if (!regressionRejected) {
      throw new Error(
        'REGRESSION WAS NOT REJECTED — this is a safety failure',
      );
    }

    console.log('\n===== VERIFY ROLLBACK / STATE PRESERVATION =====');

    const after = await dbQuery(
      `SELECT
         (SELECT COUNT(*)::text
            FROM fills
           WHERE order_id = $1) AS fill_count,
         (SELECT COALESCE(SUM(quantity), 0)::text
            FROM fills
           WHERE order_id = $1) AS fill_quantity,
         (SELECT COALESCE(SUM(quote_amount), 0)::text
            FROM fills
           WHERE order_id = $1) AS fill_quote,
         (SELECT COALESCE(SUM(fee_amount), 0)::text
            FROM fills
           WHERE order_id = $1) AS fill_fee,
         (SELECT quantity::text
            FROM positions
           WHERE bot_id = $2
             AND symbol = 'BTC/USDT') AS position_quantity,
         (SELECT total_fees::text
            FROM positions
           WHERE bot_id = $2
             AND symbol = 'BTC/USDT') AS position_fees,
         (SELECT status
            FROM orders
           WHERE id = $3) AS order_status`,
      [orderId, botId, orderId],
    );

    console.log(after.rows[0]);

    const beforeRow = before.rows[0];
    const afterRow = after.rows[0];

    const checks = [
      ['fill_count', beforeRow.fill_count, afterRow.fill_count],
      ['fill_quantity', beforeRow.fill_quantity, afterRow.fill_quantity],
      ['fill_quote', beforeRow.fill_quote, afterRow.fill_quote],
      ['fill_fee', beforeRow.fill_fee, afterRow.fill_fee],
      [
        'position_quantity',
        beforeRow.position_quantity,
        afterRow.position_quantity,
      ],
      ['position_fees', beforeRow.position_fees, afterRow.position_fees],
      ['order_status', beforeRow.order_status, afterRow.order_status],
    ];

    for (const [name, expected, actual] of checks) {
      if (expected !== actual) {
        throw new Error(
          `ROLLBACK FAILURE: ${name}: expected ${expected}, got ${actual}`,
        );
      }
    }

    if (Number(afterRow.fill_quantity) !== 1.5) {
      throw new Error(
        `Expected fill quantity to remain 1.5, got ${afterRow.fill_quantity}`,
      );
    }

    if (Number(afterRow.position_quantity) !== 1.5) {
      throw new Error(
        `Expected position quantity to remain 1.5, got ${afterRow.position_quantity}`,
      );
    }

    if (Number(afterRow.position_fees) !== 0.15) {
      throw new Error(
        `Expected position fees to remain 0.15, got ${afterRow.position_fees}`,
      );
    }

    console.log('\n========================================');
    console.log('E2E FILL REGRESSION TEST: PASSED');
    console.log('========================================');
    console.log('Regression rejected : YES');
    console.log('Fill state preserved : YES');
    console.log('Position preserved   : YES');
    console.log('Fee state preserved  : YES');
    console.log('Order state preserved: YES');
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
