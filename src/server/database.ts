import { randomUUID } from 'node:crypto';
import { getReferralActivationBonus } from '../config/licensePromo';
import { FINANCIAL_CONFIG, getGasTopupBonus } from '../config/financialConfig';

let poolPromise: Promise<any> | null = null;

async function getPool(): Promise<any> {
  if (!process.env.DATABASE_URL) {
    throw Object.assign(new Error('DATABASE_URL is required for authoritative financial persistence.'), { code: 'DATABASE_NOT_CONFIGURED' });
  }
  if (!poolPromise) {
    // @ts-ignore Optional runtime dependency is installed by production deployment.
    poolPromise = import('pg').then(({ Pool }) => new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 20),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
    }));
  }
  return poolPromise;
}

export async function dbQuery<T = any>(text: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
  const pool = await getPool();
  return pool.query(text, values);
}

export async function dbTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    await dbQuery('SELECT 1');
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error: any) {
    return { ok: false, latencyMs: Date.now() - started, error: String(error?.code || error?.message || 'DATABASE_ERROR').slice(0, 120) };
  }
}

export async function ensureUser(input: { firebaseUid: string; email?: string; memberId?: string; status?: string; username?: string; sponsorMemberId?: string }) {
  const result = await dbQuery<{ id: string; firebase_uid: string; member_id: string | null }>(
    `INSERT INTO users (firebase_uid, email, member_id, status, sponsor_user_id)
     VALUES ($1, $2, $3, COALESCE($4, 'active'), CASE WHEN CAST($5 AS text) IS NULL OR CAST($5 AS text) = '' THEN NULL ELSE (SELECT id FROM users WHERE member_id = CAST($5 AS text)) END)
     ON CONFLICT (firebase_uid) DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email), member_id = COALESCE(EXCLUDED.member_id, users.member_id), sponsor_user_id = COALESCE(users.sponsor_user_id, EXCLUDED.sponsor_user_id), updated_at = now()
     RETURNING id, firebase_uid, member_id`,
    [input.firebaseUid, input.email || null, input.memberId || null, input.status || null, input.sponsorMemberId || null],
  );
  return result.rows[0];
}

export async function getUserByFirebaseUid(firebaseUid: string) {
  const result = await dbQuery<any>('SELECT * FROM users WHERE firebase_uid = $1', [firebaseUid]);
  return result.rows[0] || null;
}

export async function getWalletSnapshot(firebaseUid: string) {
  const result = await dbQuery<any>(
    `SELECT u.id, u.firebase_uid, u.member_id, u.status,
            u.status AS member_status,
            sponsor.member_id AS sponsor_member_id,
            COALESCE(active_license.status, 'NONE') AS license_status,
            active_license.tier AS license_tier,
            active_license.license_type AS license_type,
            active_license.name AS license_name,
            active_license.max_active_bots AS max_active_bots,
            active_license.expires_at AS license_expires_at,
            COALESCE(w.currency, 'USDT') AS currency,
            COALESCE(w.available_balance, 0) AS available_balance,
            COALESCE(w.locked_balance, 0) AS locked_balance,
            COALESCE(w.total_inflow, 0) AS total_inflow,
            COALESCE(w.total_outflow, 0) AS total_outflow,
            COALESCE(w.gas_reserve, 0) AS gas_reserve,
            COALESCE(w.non_cash_gas_bonus, 0) AS non_cash_gas_bonus,
            COALESCE(w.withdrawable_trading_yield, 0) AS withdrawable_trading_yield,
            COALESCE(s.two_factor_enabled, false) AS two_factor_enabled
       FROM users u
       LEFT JOIN wallet_accounts w ON w.user_id = u.id AND w.currency = 'USDT'
       LEFT JOIN security_credentials s ON s.user_id = u.id
       LEFT JOIN users sponsor ON sponsor.id = u.sponsor_user_id
       LEFT JOIN LATERAL (
         SELECT l.status, l.tier, l.license_type, l.name, l.max_active_bots, l.expires_at
           FROM licenses l
          WHERE l.user_id = u.id
            AND l.status = 'ACTIVE'
            AND (l.expires_at IS NULL OR l.expires_at > now())
          ORDER BY l.activated_at DESC
          LIMIT 1
       ) active_license ON TRUE
      WHERE u.firebase_uid = $1`,
    [firebaseUid],
  );
  return result.rows[0] || null;
}

export async function createWalletIfMissing(firebaseUid: string, currency = 'USDT') {
  await dbQuery(
    `INSERT INTO wallet_accounts (user_id, currency)
     SELECT id, $2 FROM users WHERE firebase_uid = $1
     ON CONFLICT (user_id, currency) DO NOTHING`,
    [firebaseUid, currency],
  );
}

export async function appendLedgerEntry(input: {
  firebaseUid: string;
  currency?: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  type: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Ledger amount must be positive.');
  return dbTransaction(async (client) => {
    const user = await client.query('SELECT id FROM users WHERE firebase_uid = $1 FOR UPDATE', [input.firebaseUid]);
    if (!user.rows[0]) throw new Error('User is not provisioned in the financial database.');
    const userId = user.rows[0].id;
    const currency = input.currency || 'USDT';
    const wallet = await client.query(
      `INSERT INTO wallet_accounts (user_id, currency)
       VALUES ($1, $2)
       ON CONFLICT (user_id, currency) DO UPDATE SET updated_at = now()
       RETURNING id, available_balance, locked_balance`,
      [userId, currency],
    );
    const account = wallet.rows[0];
    const before = Number(account.available_balance);
    const delta = input.direction === 'CREDIT' ? input.amount : -input.amount;
    const after = before + delta;
    if (after < 0) throw Object.assign(new Error('Insufficient available balance.'), { code: 'INSUFFICIENT_BALANCE' });
    await client.query(
      `UPDATE wallet_accounts SET available_balance = $2,
          total_inflow = total_inflow + CASE WHEN $3 = 'CREDIT' THEN $4 ELSE 0 END,
          total_outflow = total_outflow + CASE WHEN $3 = 'DEBIT' THEN $4 ELSE 0 END,
          updated_at = now()
       WHERE id = $1`,
      [account.id, after, input.direction, input.amount],
    );
    const entry = await client.query(
      `INSERT INTO wallet_ledger (account_id, direction, amount, balance_before, balance_after, entry_type, reference_type, reference_id, description, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, created_at`,
      [account.id, input.direction, input.amount, before, after, input.type, input.referenceType || null, input.referenceId || null, input.description || null, JSON.stringify(input.metadata || {})],
    );
    return { ledgerId: entry.rows[0].id, createdAt: entry.rows[0].created_at, balanceBefore: before, balanceAfter: after };
  });
}

export async function createAuditEvent(input: { userId?: string; firebaseUid?: string; botId?: string; eventType: string; correlationId?: string; payload?: Record<string, unknown> }) {
  let userId = input.userId || null;
  if (!userId && input.firebaseUid) {
    const user = await getUserByFirebaseUid(input.firebaseUid);
    userId = user?.id || null;
  }
  await dbQuery(
    `INSERT INTO audit_events (user_id, bot_id, event_type, correlation_id, payload) VALUES ($1,$2,$3,$4,$5)`,
    [userId, input.botId || null, input.eventType, input.correlationId || randomUUID(), JSON.stringify(input.payload || {})],
  );
}

export async function createOrderRecord(input: {
  firebaseUid: string; botId?: string; exchange: string; symbol: string; side: string; orderType: string;
  clientOrderId: string; idempotencyKey?: string; requestedQty?: number; requestedPrice?: number; expectedNotional?: number; status: string;
}) {
  const user = await ensureUser({ firebaseUid: input.firebaseUid });
  if (input.idempotencyKey) {
    const existing = await dbQuery<any>('SELECT id,status,exchange_order_id FROM orders WHERE idempotency_key=$1', [input.idempotencyKey]);
    if (existing.rows[0]) return { id: existing.rows[0].id as string, replayed: true, status: existing.rows[0].status };
  }
  let resolvedBotId: string | null = null;

  if (input.botId) {
    if (/^[0-9a-f-]{36}$/i.test(input.botId)) {
      resolvedBotId = input.botId;
    } else {
      const ownedBot = await dbQuery(
        `SELECT id
           FROM bots
          WHERE user_id = $1
            AND external_bot_id = $2
          LIMIT 1`,
        [user.id, input.botId],
      );

      if (!ownedBot.rows[0]) {
        throw Object.assign(new Error('Bot runtime is not provisioned.'), {
          code: 'BOT_RUNTIME_NOT_FOUND',
        });
      }

      resolvedBotId = ownedBot.rows[0].id as string;
    }
  }

  const result = await dbQuery<any>(
    `INSERT INTO orders (client_order_id, idempotency_key, bot_id, user_id, exchange, symbol, side, order_type, requested_qty, requested_price, expected_notional, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (client_order_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()
     RETURNING id,status`,
    [input.clientOrderId, input.idempotencyKey || null, resolvedBotId, user.id, input.exchange, input.symbol, input.side, input.orderType, input.requestedQty || null, input.requestedPrice || null, input.expectedNotional || null, input.status],
  );
  return { id: result.rows[0]?.id as string, replayed: false, status: result.rows[0]?.status };
}



export async function createExchangeCertificationRun(input: {
  firebaseUid: string;
  exchange: string;
  stage: 'authenticated_readonly' | 'sandbox_demo_order' | 'micro_live_order' | 'reconcile' | 'recovery';
  mode: 'READ_ONLY' | 'SANDBOX_DEMO' | 'MICRO_LIVE' | 'RECONCILE' | 'RECOVERY';
  status?: 'RUNNING' | 'PASS' | 'FAIL' | 'BLOCKED' | 'WARNING';
  symbol?: string;
  side?: string;
  orderType?: string;
  clientOrderId?: string;
  exchangeOrderId?: string;
  requestedQty?: number;
  requestedPrice?: number;
  expectedNotional?: number;
  exchangeStatus?: string;
  filledQty?: number;
  averagePrice?: number;
  result?: Record<string, unknown>;
}) {
  const user = await ensureUser({ firebaseUid: input.firebaseUid });
  const result = await dbQuery<any>(
    `INSERT INTO exchange_certification_runs (
       id, user_id, firebase_uid, exchange, stage, mode, status, symbol, side, order_type,
       client_order_id, exchange_order_id, requested_qty, requested_price, expected_notional,
       exchange_status, filled_qty, average_price, result
     ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING *`,
    [
      user.id, input.firebaseUid, input.exchange, input.stage, input.mode, input.status || 'RUNNING',
      input.symbol || null, input.side || null, input.orderType || null, input.clientOrderId || null,
      input.exchangeOrderId || null, input.requestedQty ?? null, input.requestedPrice ?? null, input.expectedNotional ?? null,
      input.exchangeStatus || null, input.filledQty ?? null, input.averagePrice ?? null, JSON.stringify(input.result || {}),
    ],
  );
  return result.rows[0];
}

export async function updateExchangeCertificationRun(id: string, input: Partial<{
  status: 'RUNNING' | 'PASS' | 'FAIL' | 'BLOCKED' | 'WARNING';
  exchangeOrderId: string;
  exchangeStatus: string;
  filledQty: number;
  averagePrice: number;
  result: Record<string, unknown>;
}>) {
  const result = await dbQuery<any>(
    `UPDATE exchange_certification_runs
        SET status = COALESCE($2, status),
            exchange_order_id = COALESCE($3, exchange_order_id),
            exchange_status = COALESCE($4, exchange_status),
            filled_qty = COALESCE($5, filled_qty),
            average_price = COALESCE($6, average_price),
            result = CASE WHEN $7::jsonb IS NULL THEN result ELSE result || $7::jsonb END,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [
      id, input.status || null, input.exchangeOrderId || null, input.exchangeStatus || null,
      input.filledQty ?? null, input.averagePrice ?? null, input.result ? JSON.stringify(input.result) : null,
    ],
  );
  return result.rows[0] || null;
}

export async function getLatestExchangeCertificationRun(firebaseUid: string, exchange: string, stage?: string) {
  const params: unknown[] = [firebaseUid, exchange];
  let sql = `SELECT * FROM exchange_certification_runs WHERE firebase_uid = $1 AND exchange = $2`;
  if (stage) {
    params.push(stage);
    sql += ` AND stage = $3`;
  }
  sql += ` ORDER BY created_at DESC LIMIT 1`;
  const result = await dbQuery<any>(sql, params);
  return result.rows[0] || null;
}

export async function finalizeOrderWithFill(input: {
  orderId: string;
  exchangeOrderId: string;
  quantity: number;
  price: number;
  quoteAmount: number;
  feeAmount?: number;
  feeAsset?: string;
}) {
  return dbTransaction(async (client) => {
    /*
     * Exchange "filled" quantity is cumulative.
     * Therefore settlement must only apply:
     *
     *   cumulative exchange quantity
     *   - quantity already recorded in fills
     *
     * This makes repeated fetchOrder()/retry/reconciliation calls idempotent.
     */

    const orderResult = await client.query(
      `SELECT id, bot_id, symbol, side, requested_qty, status, exchange_order_id
         FROM orders
        WHERE id = $1
        FOR UPDATE`,
      [input.orderId],
    );

    const order = orderResult.rows[0];

    if (!order) {
      throw Object.assign(new Error('Financial order not found.'), {
        code: 'FINANCIAL_ORDER_NOT_FOUND',
      });
    }

    if (
      order.exchange_order_id &&
      String(order.exchange_order_id) !== String(input.exchangeOrderId)
    ) {
      throw Object.assign(new Error('Exchange order identity mismatch.'), {
        code: 'EXCHANGE_ORDER_ID_MISMATCH',
      });
    }

    const cumulativeQty = Number(input.quantity);
    const cumulativeQuote = Number(input.quoteAmount);
    const incomingPrice = Number(input.price);
    const incomingFee = Number(input.feeAmount || 0);
    const requestedQty = Number(order.requested_qty || 0);

    if (!Number.isFinite(cumulativeQty) || cumulativeQty <= 0) {
      throw Object.assign(new Error('Invalid cumulative fill quantity.'), {
        code: 'INVALID_FILL_QUANTITY',
      });
    }

    if (!Number.isFinite(cumulativeQuote) || cumulativeQuote <= 0) {
      throw Object.assign(new Error('Invalid cumulative fill quote amount.'), {
        code: 'INVALID_FILL_QUOTE',
      });
    }

    if (!Number.isFinite(incomingPrice) || incomingPrice <= 0) {
      throw Object.assign(new Error('Invalid fill price.'), {
        code: 'INVALID_FILL_PRICE',
      });
    }

    const settledResult = await client.query(
      `SELECT
          COALESCE(SUM(quantity), 0) AS settled_quantity,
          COALESCE(SUM(quote_amount), 0) AS settled_quote,
          COALESCE(SUM(COALESCE(fee_amount, 0)), 0) AS settled_fee
         FROM fills
        WHERE order_id = $1`,
      [input.orderId],
    );

    const settled = settledResult.rows[0] || {};

    const settledQty = Number(settled.settled_quantity || 0);
    const settledQuote = Number(settled.settled_quote || 0);
    const settledFee = Number(settled.settled_fee || 0);

    const EPSILON = 1e-10;

    const rawDeltaQty = cumulativeQty - settledQty;

    /*
     * Exchange must never move backwards.
     * If it does, stop settlement rather than corrupting position state.
     */
    if (rawDeltaQty < -EPSILON) {
      throw Object.assign(
        new Error(
          `Exchange cumulative fill regressed: exchange=${cumulativeQty}, settled=${settledQty}`,
        ),
        {
          code: 'FILL_QUANTITY_REGRESSION',
        },
      );
    }

    const isTerminalFilled =
      requestedQty > 0 &&
      cumulativeQty + EPSILON >= requestedQty;

    const targetStatus = isTerminalFilled
      ? 'filled'
      : 'partially_filled';

    /*
     * Replay:
     * Exchange reports the same cumulative quantity again.
     * Nothing must be added to fills or positions.
     */
    if (rawDeltaQty <= EPSILON) {
      await client.query(
        `UPDATE orders
            SET exchange_order_id = $2,
                status = $3,
                updated_at = now()
          WHERE id = $1`,
        [
          input.orderId,
          input.exchangeOrderId,
          targetStatus,
        ],
      );

      return {
        replayed: true,
        deltaQuantity: 0,
        cumulativeQuantity: cumulativeQty,
        status: targetStatus,
      };
    }

    const deltaQty = rawDeltaQty;

    /*
     * quoteAmount supplied by the caller represents cumulative
     * executed notional. Convert it into only the new delta.
     */
    let deltaQuote = cumulativeQuote - settledQuote;

    if (!Number.isFinite(deltaQuote) || deltaQuote <= EPSILON) {
      deltaQuote = deltaQty * incomingPrice;
    }

    const deltaPrice = deltaQuote / deltaQty;

    /*
     * Fee handling:
     * assume exchange order.fee.cost is cumulative for this
     * order snapshot. Only the incremental fee is applied.
     */
    let deltaFee = incomingFee - settledFee;

    if (!Number.isFinite(deltaFee) || deltaFee < 0) {
      deltaFee = 0;
    }

    /*
     * Lock position before modifying it.
     * The entire fill + position + order update remains inside
     * the same PostgreSQL transaction.
     */
    if (order.bot_id) {
      const positionResult = await client.query(
        `SELECT *
           FROM positions
          WHERE bot_id = $1
            AND symbol = $2
          FOR UPDATE`,
        [order.bot_id, order.symbol],
      );

      const position = positionResult.rows[0];
      const side = String(order.side || '').toLowerCase();

      if (!position) {
        if (side === 'sell') {
          throw Object.assign(
            new Error('Cannot apply sell fill without an existing position.'),
            {
              code: 'POSITION_MISSING_FOR_SELL',
            },
          );
        }

        await client.query(
          `INSERT INTO positions
            (bot_id, symbol, quantity, average_entry, realized_pnl, unrealized_pnl, total_fees)
           VALUES ($1, $2, $3, $4, 0, 0, $5)`,
          [
            order.bot_id,
            order.symbol,
            deltaQty,
            deltaPrice,
            deltaFee,
          ],
        );
      } else {
        const oldQty = Number(position.quantity || 0);
        const oldAvg = Number(position.average_entry || 0);

        let newQty = oldQty;
        let newAvg = oldAvg;
        let realized = Number(position.realized_pnl || 0);

        if (side === 'buy') {
          newQty = oldQty + deltaQty;

          newAvg =
            newQty > 0
              ? ((oldQty * oldAvg) + deltaQuote) / newQty
              : 0;
        } else if (side === 'sell') {
          if (deltaQty > oldQty + EPSILON) {
            throw Object.assign(
              new Error(
                `Sell fill exceeds database position: sell=${deltaQty}, position=${oldQty}`,
              ),
              {
                code: 'POSITION_QUANTITY_INSUFFICIENT',
              },
            );
          }

          const sold = Math.min(deltaQty, oldQty);

          realized +=
            (deltaPrice - oldAvg) * sold - deltaFee;

          newQty = Math.max(0, oldQty - deltaQty);

          if (newQty <= EPSILON) {
            newQty = 0;
            newAvg = 0;
          }
        } else {
          throw Object.assign(
            new Error(`Unsupported order side: ${side}`),
            {
              code: 'UNSUPPORTED_ORDER_SIDE',
            },
          );
        }

        await client.query(
          `UPDATE positions
              SET quantity = $3,
                  average_entry = $4,
                  realized_pnl = $5,
                  total_fees = total_fees + $6,
                  updated_at = now()
            WHERE bot_id = $1
              AND symbol = $2`,
          [
            order.bot_id,
            order.symbol,
            newQty,
            newAvg,
            realized,
            deltaFee,
          ],
        );
      }
    }

    /*
     * Insert ONLY the delta fill.
     *
     * exchange_trade_id currently stores exchange order id,
     * so we intentionally do not add a UNIQUE constraint here:
     * one exchange order can legitimately contain multiple fills.
     */
    await client.query(
      `INSERT INTO fills
        (order_id, exchange_trade_id, price, quantity, quote_amount, fee_amount, fee_asset, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        input.orderId,
        input.exchangeOrderId,
        deltaPrice,
        deltaQty,
        deltaQuote,
        deltaFee > 0 ? deltaFee : null,
        input.feeAsset || null,
        JSON.stringify({
          source: 'finalizeOrderWithFill',
          cumulativeQuantity: cumulativeQty,
          cumulativeQuote,
          cumulativeFee: incomingFee,
          settledQuantity: settledQty,
          settledQuote,
          settledFee,
        }),
      ],
    );

    // Authoritative referral trading-fee settlement. Only USDT-denominated
    // exchange fees are credited as USDT rewards; non-USDT fees remain exchange-native.
    if (deltaFee > EPSILON && String(input.feeAsset || '').toUpperCase() === 'USDT') {
      const orderUser = await client.query(
        `SELECT u.id AS source_user_id, u.sponsor_user_id
           FROM orders o
           JOIN users u ON u.id = o.user_id
          WHERE o.id = $1`,
        [input.orderId],
      );
      const sponsorId = orderUser.rows[0]?.sponsor_user_id;
      if (sponsorId) {
        const reward = Number((deltaFee * FINANCIAL_CONFIG.referral.tradingFeeCashPct / 100).toFixed(10));
        if (reward > EPSILON) {
          const sponsorWallet = await client.query(
            `SELECT id, available_balance, withdrawable_trading_yield
               FROM wallet_accounts
              WHERE user_id = $1 AND currency = 'USDT'
              FOR UPDATE`,
            [sponsorId],
          );
          if (sponsorWallet.rows[0]) {
            const before = Number(sponsorWallet.rows[0].available_balance || 0);
            const after = before + reward;
            await client.query(
              `UPDATE wallet_accounts
                  SET available_balance = $2,
                      withdrawable_trading_yield = withdrawable_trading_yield + $3,
                      total_inflow = total_inflow + $3,
                      version = version + 1,
                      updated_at = now()
                WHERE id = $1`,
              [sponsorWallet.rows[0].id, after, reward],
            );
            await client.query(
              `INSERT INTO wallet_ledger
                (account_id,direction,amount,balance_before,balance_after,entry_type,reference_type,reference_id,description,metadata)
               VALUES ($1,'CREDIT',$2,$3,$4,'REFERRAL_TRADING_FEE','ORDER',$5,$6,$7::jsonb)`,
              [sponsorWallet.rows[0].id, reward, before, after, input.orderId, '20% cash referral share of USDT trading fee', JSON.stringify({ feeUsdt: deltaFee, pct: FINANCIAL_CONFIG.referral.tradingFeeCashPct })],
            );
            await client.query(
              `INSERT INTO referral_events(sponsor_user_id,source_user_id,event_type,gross_amount,reward_amount,cashable,metadata)
               VALUES($1,$2,'TRADING_FEE',$3,$4,true,$5)`,
              [sponsorId, orderUser.rows[0].source_user_id, deltaFee, reward, JSON.stringify({ orderId: input.orderId, feeAsset: input.feeAsset || 'USDT' })],
            );
          }
        }
      }
    }

    await client.query(
      `UPDATE orders
          SET exchange_order_id = $2,
              status = $3,
              updated_at = now()
        WHERE id = $1`,
      [
        input.orderId,
        input.exchangeOrderId,
        targetStatus,
      ],
    );

    return {
      replayed: false,
      deltaQuantity: deltaQty,
      cumulativeQuantity: cumulativeQty,
      deltaQuote,
      deltaPrice,
      deltaFee,
      status: targetStatus,
    };
  });
}


export async function saveTwoFactorSecret(firebaseUid: string, payload: { enabled: boolean; ciphertext?: string; iv?: string; authTag?: string }) {
  const user = await getUserByFirebaseUid(firebaseUid);
  if (!user) throw new Error('User is not provisioned in the financial database.');
  await dbQuery(
    `INSERT INTO security_credentials (user_id, two_factor_enabled, two_factor_secret_ciphertext, two_factor_secret_iv, two_factor_secret_auth_tag)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET two_factor_enabled=EXCLUDED.two_factor_enabled,
       two_factor_secret_ciphertext=EXCLUDED.two_factor_secret_ciphertext,
       two_factor_secret_iv=EXCLUDED.two_factor_secret_iv,
       two_factor_secret_auth_tag=EXCLUDED.two_factor_secret_auth_tag,
       updated_at=now()`,
    [user.id, payload.enabled, payload.enabled ? (payload.ciphertext || null) : null, payload.enabled ? (payload.iv || null) : null, payload.enabled ? (payload.authTag || null) : null],
  );
}

export async function getTwoFactorSecretRecord(firebaseUid: string) {
  const result = await dbQuery<any>(
    `SELECT s.two_factor_enabled, s.two_factor_secret_ciphertext, s.two_factor_secret_iv, s.two_factor_secret_auth_tag
       FROM security_credentials s JOIN users u ON u.id=s.user_id WHERE u.firebase_uid=$1`,
    [firebaseUid],
  );
  return result.rows[0] || null;
}

export async function getSystemSetting<T = unknown>(key: string): Promise<T | null> {
  const result = await dbQuery<any>('SELECT value FROM system_settings WHERE key=$1', [key]);
  return result.rows[0]?.value ?? null;
}

export async function setSystemSetting(key: string, value: unknown, updatedByFirebaseUid?: string): Promise<void> {
  const user = updatedByFirebaseUid ? await getUserByFirebaseUid(updatedByFirebaseUid) : null;
  await dbQuery(`INSERT INTO system_settings(key,value,updated_by) VALUES($1,$2::jsonb,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`, [key, JSON.stringify(value), user?.id || null]);
}

export async function closeDatabase() {
  if (!poolPromise) return;
  const pool = await poolPromise;
  await pool.end();
  poolPromise = null;
}

export async function activateLicenseAtomic(input: { firebaseUid: string; tier: string; fee: number; tradingBonus: number; maxActiveBots: number; licenseName: string; idempotencyKey?: string }) {
  return dbTransaction(async (client) => {
    const user = await client.query('SELECT id, member_id, status FROM users WHERE firebase_uid=$1 FOR UPDATE', [input.firebaseUid]);
    if (!user.rows[0]) throw Object.assign(new Error('User is not provisioned.'), { code: 'ACCOUNT_NOT_PROVISIONED' });
    const userId = user.rows[0].id;
    if (input.idempotencyKey) {
      const replay = await client.query(`SELECT id, user_id, tier, name, fee, trading_bonus, max_active_bots FROM licenses WHERE idempotency_key=$1`, [input.idempotencyKey]);
      if (replay.rows[0] && replay.rows[0].user_id !== userId) {
        throw Object.assign(new Error('Idempotency key is already bound to another account.'), { code: 'ACTIVATION_IDEMPOTENCY_CONFLICT' });
      }
      if (replay.rows[0]) {
        const wallet = await client.query(`SELECT available_balance, gas_reserve FROM wallet_accounts WHERE user_id=$1 AND currency='USDT'`, [userId]);
        return { activationId: replay.rows[0].id, memberId: user.rows[0].member_id, newBalance: Number(wallet.rows[0]?.available_balance || 0), tradingBonus: Number(replay.rows[0].trading_bonus), gasReserve: Number(wallet.rows[0]?.gas_reserve || 0), ledgerDebitId: null, referralBonus: 0, referralEventId: null, referralSponsorFirebaseUid: null, replayed: true };
      }
    }
    const existing = await client.query(`SELECT id FROM licenses WHERE user_id=$1 AND status='ACTIVE' LIMIT 1`, [userId]);
    if (existing.rows[0]) throw Object.assign(new Error('License is already active.'), { code: 'LICENSE_ALREADY_ACTIVE' });
    const wallet = await client.query(`SELECT * FROM wallet_accounts WHERE user_id=$1 AND currency='USDT' FOR UPDATE`, [userId]);
    if (!wallet.rows[0] || Number(wallet.rows[0].available_balance) < input.fee) throw Object.assign(new Error('Insufficient available balance.'), { code: 'INSUFFICIENT_BALANCE' });
    const before = Number(wallet.rows[0].available_balance);
    const after = before - input.fee;
    await client.query(`UPDATE wallet_accounts SET available_balance=$2, total_outflow=total_outflow+$3, gas_reserve=gas_reserve+$4, total_inflow=total_inflow+$4, version=version+1, updated_at=now() WHERE id=$1`, [wallet.rows[0].id, after, input.fee, input.tradingBonus]);
    const activation = await client.query(`INSERT INTO licenses (user_id,tier,license_type,name,fee,trading_bonus,max_active_bots,idempotency_key) VALUES ($1,$2,'lifetime',$3,$4,$5,$6,$7) RETURNING id`, [userId,input.tier,input.licenseName,input.fee,input.tradingBonus,input.maxActiveBots,input.idempotencyKey||null]);
    const ledgerDebit = await client.query(`INSERT INTO wallet_ledger (account_id,direction,amount,balance_before,balance_after,entry_type,reference_type,reference_id,description) VALUES ($1,'DEBIT',$2,$3,$4,'LICENSE_ACTIVATION','LICENSE',$5,$6) RETURNING id`, [wallet.rows[0].id,input.fee,before,after,activation.rows[0].id,input.licenseName]);
    await client.query(`UPDATE users SET status='active', updated_at=now() WHERE id=$1`, [userId]);

    let referralBonus = 0;
    let referralEventId: string | null = null;
    let referralSponsorFirebaseUid: string | null = null;
    const sponsor = await client.query(`SELECT u.id, u.member_id, u.firebase_uid FROM users u WHERE u.id=(SELECT sponsor_user_id FROM users WHERE id=$1) FOR UPDATE`, [userId]);
    if (sponsor.rows[0] && sponsor.rows[0].id !== userId) {
      referralBonus = getReferralActivationBonus(Number(input.fee));
      if (referralBonus > 0) {
        const sponsorWallet = await client.query(`SELECT id,available_balance FROM wallet_accounts WHERE user_id=$1 AND currency='USDT' FOR UPDATE`, [sponsor.rows[0].id]);
        if (sponsorWallet.rows[0]) {
          const sponsorBefore = Number(sponsorWallet.rows[0].available_balance);
          const sponsorAfter = sponsorBefore + referralBonus;
          await client.query(`UPDATE wallet_accounts SET available_balance=$2,total_inflow=total_inflow+$3,withdrawable_trading_yield=withdrawable_trading_yield+$3,version=version+1,updated_at=now() WHERE id=$1`, [sponsorWallet.rows[0].id,sponsorAfter,referralBonus]);
          const event = await client.query(`INSERT INTO referral_events(sponsor_user_id,source_user_id,event_type,gross_amount,reward_amount,cashable,metadata) VALUES($1,$2,'ACTIVATION', $3,$4,true,$5) RETURNING id`, [sponsor.rows[0].id,userId,input.fee,referralBonus,JSON.stringify({tier:input.tier,licenseId:activation.rows[0].id})]);
          referralEventId = event.rows[0].id;
          referralSponsorFirebaseUid = sponsor.rows[0].firebase_uid;
          await client.query(`INSERT INTO wallet_ledger(account_id,direction,amount,balance_before,balance_after,entry_type,reference_type,reference_id,description,metadata) VALUES($1,'CREDIT',$2,$3,$4,'REFERRAL_ACTIVATION','REFERRAL',$5,$6,$7)`, [sponsorWallet.rows[0].id,referralBonus,sponsorBefore,sponsorAfter,referralEventId,`20% sponsor reward for ${input.licenseName}`,JSON.stringify({sourceUserId:userId,licenseId:activation.rows[0].id})]);
        }
      }
    }
    return { activationId: activation.rows[0].id, memberId: user.rows[0].member_id, newBalance: after, tradingBonus: input.tradingBonus, gasReserve: Number(wallet.rows[0].gas_reserve)+input.tradingBonus, ledgerDebitId: ledgerDebit.rows[0].id, referralBonus, referralEventId, referralSponsorFirebaseUid, replayed: false };
  });
}

export async function transferFundsAtomic(input: { senderFirebaseUid: string; recipientMemberId: string; amount: number; note?: string; idempotencyKey?: string }) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error('Transfer amount must be positive and finite.'), { code: 'TRANSFER_AMOUNT_INVALID' });
  if (amount > 1_000_000) throw Object.assign(new Error('Transfer amount exceeds the configured safety limit.'), { code: 'TRANSFER_AMOUNT_LIMIT' });
  return dbTransaction(async (client) => {
    const sender = await client.query(`SELECT id, member_id FROM users WHERE firebase_uid=$1 FOR UPDATE`, [input.senderFirebaseUid]);
    if (!sender.rows[0]) throw Object.assign(new Error('Sender account is not provisioned.'), { code: 'ACCOUNT_NOT_PROVISIONED' });
    const recipient = await client.query(`SELECT id, member_id FROM users WHERE member_id=$1 FOR UPDATE`, [input.recipientMemberId]);
    if (!recipient.rows[0]) throw Object.assign(new Error('Recipient was not found.'), { code: 'TRANSFER_RECIPIENT_NOT_FOUND' });
    if (recipient.rows[0].id === sender.rows[0].id) throw Object.assign(new Error('Self transfer is not allowed.'), { code: 'TRANSFER_SELF_NOT_ALLOWED' });
    if (input.idempotencyKey) {
      const existing = await client.query(`SELECT id FROM transfers WHERE idempotency_key=$1`, [input.idempotencyKey]);
      if (existing.rows[0]) return { transferId: existing.rows[0].id, replayed: true };
    }
    const wallets = await client.query(`SELECT id,user_id,available_balance FROM wallet_accounts WHERE user_id = ANY($1::uuid[]) AND currency='USDT' FOR UPDATE`, [[sender.rows[0].id, recipient.rows[0].id]]);
    const senderWallet = wallets.rows.find((w:any)=>w.user_id===sender.rows[0].id);
    const recipientWallet = wallets.rows.find((w:any)=>w.user_id===recipient.rows[0].id);
    if (!senderWallet || !recipientWallet || Number(senderWallet.available_balance) < input.amount) throw Object.assign(new Error('Insufficient available balance.'), { code: 'INSUFFICIENT_BALANCE' });
    const transfer = await client.query(`INSERT INTO transfers(sender_user_id,recipient_user_id,amount,fee,status,idempotency_key,note,completed_at) VALUES($1,$2,$3,0,'COMPLETED',$4,$5,now()) RETURNING id`, [sender.rows[0].id,recipient.rows[0].id,input.amount,input.idempotencyKey||null,input.note||null]);
    const senderAfter = Number(senderWallet.available_balance)-input.amount;
    const recipientAfter = Number(recipientWallet.available_balance)+input.amount;
    await client.query(`UPDATE wallet_accounts SET available_balance=$2,total_outflow=total_outflow+$3,version=version+1,updated_at=now() WHERE id=$1`, [senderWallet.id,senderAfter,input.amount]);
    await client.query(`UPDATE wallet_accounts SET available_balance=$2,total_inflow=total_inflow+$3,version=version+1,updated_at=now() WHERE id=$1`, [recipientWallet.id,recipientAfter,input.amount]);
    await client.query(`INSERT INTO wallet_ledger(account_id,direction,amount,balance_before,balance_after,entry_type,reference_type,reference_id,description) VALUES($1,'DEBIT',$2,$3,$4,'P2P_TRANSFER','TRANSFER',$5,$6)`, [senderWallet.id,input.amount,Number(senderWallet.available_balance),senderAfter,transfer.rows[0].id,input.note||'P2P transfer']);
    await client.query(`INSERT INTO wallet_ledger(account_id,direction,amount,balance_before,balance_after,entry_type,reference_type,reference_id,description) VALUES($1,'CREDIT',$2,$3,$4,'P2P_TRANSFER','TRANSFER',$5,$6)`, [recipientWallet.id,input.amount,Number(recipientWallet.available_balance),recipientAfter,transfer.rows[0].id,input.note||'P2P transfer']);
    return { transferId: transfer.rows[0].id, replayed: false, senderMemberId: sender.rows[0].member_id, recipientMemberId: recipient.rows[0].member_id, senderBalance: senderAfter };
  });
}

export async function createWithdrawalRequest(input: { firebaseUid: string; address: string; amount: number; fee: number; network: string; idempotencyKey: string }) {
  const amount = Number(input.amount);
  const fee = Number(input.fee);
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error('Withdrawal amount must be positive and finite.'), { code: 'WITHDRAW_AMOUNT_INVALID' });
  if (!Number.isFinite(fee) || fee < 0) throw Object.assign(new Error('Withdrawal fee is invalid.'), { code: 'WITHDRAW_FEE_INVALID' });
  if (!input.idempotencyKey?.trim()) throw Object.assign(new Error('Withdrawal idempotency key is required.'), { code: 'WITHDRAW_IDEMPOTENCY_REQUIRED' });
  return dbTransaction(async (client) => {
    const user = await client.query(`SELECT id FROM users WHERE firebase_uid=$1 FOR UPDATE`, [input.firebaseUid]);
    if (!user.rows[0]) throw Object.assign(new Error('Account not provisioned.'), { code: 'ACCOUNT_NOT_PROVISIONED' });
    const existing = await client.query(`SELECT id,status,amount,fee,net_amount,network FROM withdrawals WHERE idempotency_key=$1`, [input.idempotencyKey]);
    if (existing.rows[0]) return { ...existing.rows[0], replayed: true };
    const wallet = await client.query(`SELECT id,available_balance FROM wallet_accounts WHERE user_id=$1 AND currency='USDT' FOR UPDATE`, [user.rows[0].id]);
    const totalDebit=input.amount;
    if (!wallet.rows[0] || Number(wallet.rows[0].available_balance)<totalDebit) throw Object.assign(new Error('Insufficient available balance.'), { code: 'INSUFFICIENT_BALANCE' });
    const netAmount=input.amount-input.fee;
    const withdrawal=await client.query(`INSERT INTO withdrawals(user_id,network,destination_address,amount,fee,net_amount,status,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,'REVIEW',$7) RETURNING id`, [user.rows[0].id,input.network,input.address,input.amount,input.fee,netAmount,input.idempotencyKey]);
    const after=Number(wallet.rows[0].available_balance)-input.amount;
    await client.query(`UPDATE wallet_accounts SET available_balance=$2,locked_balance=locked_balance+$3,total_outflow=total_outflow+$3,version=version+1,updated_at=now() WHERE id=$1`, [wallet.rows[0].id,after,input.amount]);
    await client.query(`INSERT INTO wallet_ledger(account_id,direction,amount,balance_before,balance_after,entry_type,reference_type,reference_id,description) VALUES($1,'DEBIT',$2,$3,$4,'WITHDRAWAL_HOLD','WITHDRAWAL',$5,$6)`, [wallet.rows[0].id,input.amount,Number(wallet.rows[0].available_balance),after,withdrawal.rows[0].id,'Withdrawal settlement hold']);
    return { id: withdrawal.rows[0].id, status:'REVIEW', amount:input.amount, fee:input.fee, netAmount, network:input.network, replayed:false };
  });
}

export async function recordConfirmedDeposit(input: { firebaseUid: string; network: string; txHash: string; amount: number; blockNumber?: number; confirmations: number; destinationAddress?: string }) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error('Deposit amount must be positive and finite.'), { code: 'DEPOSIT_AMOUNT_INVALID' });
  if (!input.txHash?.trim()) throw Object.assign(new Error('Deposit transaction hash is required.'), { code: 'DEPOSIT_TX_HASH_REQUIRED' });
  return dbTransaction(async (client) => {
    const user = await client.query(`SELECT id FROM users WHERE firebase_uid=$1 FOR UPDATE`, [input.firebaseUid]);
    if (!user.rows[0]) throw Object.assign(new Error('Account not provisioned.'), { code:'ACCOUNT_NOT_PROVISIONED' });
    const existing = await client.query(`SELECT id,user_id,status,amount FROM deposits WHERE network=$1 AND tx_hash=$2 FOR UPDATE`, [input.network,input.txHash]);
    if (existing.rows[0]) {
      if (String(existing.rows[0].user_id) !== String(user.rows[0].id)) {
        throw Object.assign(new Error('This transaction hash has already been credited to another account.'), { code: 'DEPOSIT_TX_ALREADY_CLAIMED' });
      }
      return { depositId:existing.rows[0].id,status:existing.rows[0].status,amount:Number(existing.rows[0].amount),replayed:true };
    }
    const wallet = await client.query(`SELECT id,available_balance FROM wallet_accounts WHERE user_id=$1 AND currency='USDT' FOR UPDATE`, [user.rows[0].id]);
    const before=Number(wallet.rows[0]?.available_balance||0), after=before+input.amount;
    const deposit=await client.query(`INSERT INTO deposits(user_id,network,tx_hash,destination_address,amount,block_number,confirmations,status,verified_at,credited_at) VALUES($1,$2,$3,$4,$5,$6,$7,'CREDITED',now(),now()) RETURNING id`, [user.rows[0].id,input.network,input.txHash,input.destinationAddress||null,input.amount,input.blockNumber||null,input.confirmations]);
    await client.query(`UPDATE wallet_accounts SET available_balance=$2,total_inflow=total_inflow+$3,version=version+1,updated_at=now() WHERE id=$1`, [wallet.rows[0].id,after,input.amount]);
    await client.query(`INSERT INTO wallet_ledger(account_id,direction,amount,balance_before,balance_after,entry_type,reference_type,reference_id,description) VALUES($1,'CREDIT',$2,$3,$4,'ONCHAIN_DEPOSIT','DEPOSIT',$5,$6)`, [wallet.rows[0].id,input.amount,before,after,deposit.rows[0].id,`Confirmed ${input.network} deposit`]);
    return { depositId:deposit.rows[0].id,status:'CREDITED',amount:input.amount,replayed:false };
  });
}


export async function updateBotRuntimeStatus(input: {
  firebaseUid: string;
  externalBotId: string;
  status: string;
}) {
  const user = await getUserByFirebaseUid(input.firebaseUid);
  if (!user) {
    throw Object.assign(new Error('User is not provisioned.'), {
      code: 'ACCOUNT_NOT_PROVISIONED',
    });
  }

  const result = await dbQuery(
    `UPDATE bots
        SET status = $3,
            updated_at = now()
      WHERE user_id = $1
        AND external_bot_id = $2
      RETURNING id, status`,
    [user.id, input.externalBotId, input.status],
  );

  if (!result.rows[0]) {
    throw Object.assign(new Error('Bot runtime is not provisioned.'), {
      code: 'BOT_RUNTIME_NOT_FOUND',
    });
  }

  return {
    botId: result.rows[0].id,
    status: result.rows[0].status,
  };
}

export async function upsertBotRuntime(input: { firebaseUid: string; externalBotId: string; name: string; exchange: string; symbol: string; strategyType: string; mode: string; status: string; config?: Record<string, any> }) {
  const user = await getUserByFirebaseUid(input.firebaseUid);
  if (!user) throw new Error('User is not provisioned.');

  const exchangeAccount = await dbQuery<any>(
    `SELECT ea.id, ea.sandbox, ea.status
       FROM exchange_accounts ea
      WHERE ea.user_id=$1
        AND lower(ea.exchange)=lower($2)
        AND ea.status='ACTIVE'
      ORDER BY ea.updated_at DESC NULLS LAST, ea.created_at DESC
      LIMIT 1`,
    [user.id, input.exchange],
  );

  if (!exchangeAccount.rows[0]) {
    throw Object.assign(new Error('Active exchange account is required before registering a bot.'), {
      code: 'BOT_EXCHANGE_ACCOUNT_MISSING',
    });
  }

  const result = await dbQuery<any>(
    `INSERT INTO bots(user_id,name,exchange_account_id,symbol,strategy_type,status,mode,external_bot_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (external_bot_id) WHERE external_bot_id IS NOT NULL
     DO UPDATE SET
       name=EXCLUDED.name,
       exchange_account_id=EXCLUDED.exchange_account_id,
       symbol=EXCLUDED.symbol,
       strategy_type=EXCLUDED.strategy_type,
       status=EXCLUDED.status,
       mode=EXCLUDED.mode,
       updated_at=now()
     RETURNING id`,
    [user.id,input.name,exchangeAccount.rows[0].id,input.symbol,input.strategyType,input.status,input.mode,input.externalBotId],
  );
  const botId=result.rows[0]?.id as string;
  const c=input.config||{};
  await dbQuery(`INSERT INTO bot_strategy_configs(bot_id,base_order_usd,take_profit_pct,trailing_tp_pct,max_layers,step_deviation_pct,step_scale,volume_multiplier,max_capital_usd,min_price,max_price,config)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT(bot_id) DO UPDATE SET base_order_usd=EXCLUDED.base_order_usd,take_profit_pct=EXCLUDED.take_profit_pct,trailing_tp_pct=EXCLUDED.trailing_tp_pct,max_layers=EXCLUDED.max_layers,step_deviation_pct=EXCLUDED.step_deviation_pct,step_scale=EXCLUDED.step_scale,volume_multiplier=EXCLUDED.volume_multiplier,max_capital_usd=EXCLUDED.max_capital_usd,min_price=EXCLUDED.min_price,max_price=EXCLUDED.max_price,config=EXCLUDED.config`,
    [botId,Number(c.baseAmount||0),Number(c.baseTp||0),Number(c.tpCallbackPct||0),Number(c.maxLayers||0),Number(c.averageDownPct||0),1.25,1.3,Number(c.maxCapitalUsd||0),Number(c.minPrice||0)||null,Number(c.maxPrice||0)||null,JSON.stringify(c)]);
  return botId;
}

export async function getExchangeConnection(firebaseUid: string, exchange: string) {
  const result = await dbQuery<any>(
    `SELECT ea.id, ea.exchange, ea.sandbox, ea.status, ea.identity_key, ea.identity_type,
            ea.identity_hint, ea.credential_fingerprint, ea.reported_identity_key, ea.credential_version, ea.updated_at
       FROM exchange_accounts ea
       JOIN users u ON u.id = ea.user_id
      WHERE u.firebase_uid = $1 AND lower(ea.exchange) = lower($2)
      ORDER BY ea.updated_at DESC NULLS LAST, ea.created_at DESC
      LIMIT 1`,
    [firebaseUid, exchange],
  );
  return result.rows[0] || null;
}

export async function findExchangeIdentityOwner(input: { exchange: string; sandbox: boolean; identityKey?: string; credentialFingerprint?: string; reportedIdentityKey?: string; excludeFirebaseUid?: string }) {
  const result = await dbQuery<any>(
    `SELECT u.firebase_uid, u.member_id, ea.id AS exchange_account_id, ea.exchange, ea.sandbox, ea.status, ea.identity_type, ea.identity_hint
       FROM exchange_accounts ea
       JOIN users u ON u.id = ea.user_id
      WHERE lower(ea.exchange) = lower($1)
        AND ea.sandbox = $2
        AND (ea.identity_key = $3 OR ea.credential_fingerprint = $4 OR ($5::text IS NOT NULL AND ea.reported_identity_key = $5))
        AND ea.status = 'ACTIVE'
        AND ($6::text IS NULL OR u.firebase_uid <> $6)
      LIMIT 1`,
    [input.exchange, input.sandbox, input.identityKey || null, input.credentialFingerprint || null, input.reportedIdentityKey || null, input.excludeFirebaseUid || null],
  );
  return result.rows[0] || null;
}

export async function saveExchangeCredential(input: {
  firebaseUid: string;
  exchange: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  sandbox: boolean;
  identityKey: string;
  identityType: 'exchange_reported' | 'credential_fingerprint';
  identityHint?: string;
  credentialFingerprint: string;
  reportedIdentityKey?: string;
}) {
  const user = await getUserByFirebaseUid(input.firebaseUid);
  if (!user) throw new Error('User is not provisioned.');

  return dbTransaction(async (client) => {
    const conflict = await client.query(
      `SELECT u.firebase_uid, ea.id, ea.identity_type, ea.identity_hint
         FROM exchange_accounts ea
         JOIN users u ON u.id = ea.user_id
        WHERE lower(ea.exchange) = lower($1)
          AND ea.sandbox = $2
          AND (ea.identity_key = $3 OR ea.credential_fingerprint = $4 OR ($5::text IS NOT NULL AND ea.reported_identity_key = $5))
          AND ea.status = 'ACTIVE'
          AND u.id <> $6
        LIMIT 1
        FOR UPDATE OF ea`,
      [input.exchange, input.sandbox, input.identityKey, input.credentialFingerprint, input.reportedIdentityKey || null, user.id],
    );
    if (conflict.rows[0]) {
      throw Object.assign(new Error('Exchange account ini sudah terhubung ke akun GAIN lain.'), {
        code: 'EXCHANGE_ACCOUNT_ALREADY_LINKED',
        ownerFirebaseUid: conflict.rows[0].firebase_uid,
        identityType: conflict.rows[0].identity_type,
        identityHint: conflict.rows[0].identity_hint,
      });
    }

    const previousCredential = await client.query(
      `SELECT ec.version, ec.sandbox, ea.identity_key, ea.identity_type, ea.identity_hint, ea.credential_fingerprint, ea.reported_identity_key
         FROM exchange_credentials ec
         LEFT JOIN exchange_accounts ea ON ea.user_id = ec.user_id AND lower(ea.exchange) = lower(ec.exchange)
        WHERE ec.user_id = $1 AND lower(ec.exchange) = lower($2)
        LIMIT 1`,
      [user.id, input.exchange],
    );

    await client.query(
      `INSERT INTO exchange_credentials(user_id,exchange,ciphertext,iv,auth_tag,sandbox,status)
       VALUES($1,$2,$3,$4,$5,$6,'ACTIVE')
       ON CONFLICT(user_id,exchange) DO UPDATE SET
         ciphertext=EXCLUDED.ciphertext,
         iv=EXCLUDED.iv,
         auth_tag=EXCLUDED.auth_tag,
         sandbox=EXCLUDED.sandbox,
         status='ACTIVE',
         version=exchange_credentials.version+1,
         updated_at=now()`,
      [user.id,input.exchange,input.ciphertext,input.iv,input.authTag,input.sandbox],
    );

    const account = await client.query(
      `INSERT INTO exchange_accounts(
         user_id,exchange,credential_ref,sandbox,status,identity_key,identity_type,identity_hint,credential_fingerprint,reported_identity_key,credential_version
       ) VALUES($1,$2,$3,$4,'ACTIVE',$5,$6,$7,$8,$9,COALESCE((SELECT version FROM exchange_credentials WHERE user_id=$1 AND exchange=$2),1))
       ON CONFLICT(user_id,exchange) DO UPDATE SET
         credential_ref=EXCLUDED.credential_ref,
         sandbox=EXCLUDED.sandbox,
         status='ACTIVE',
         identity_key=EXCLUDED.identity_key,
         identity_type=EXCLUDED.identity_type,
         identity_hint=EXCLUDED.identity_hint,
         credential_fingerprint=EXCLUDED.credential_fingerprint,
         reported_identity_key=EXCLUDED.reported_identity_key,
         credential_version=EXCLUDED.credential_version,
         updated_at=now()
       RETURNING id, credential_version`,
      [user.id,input.exchange,`exchange_credentials:${input.exchange}`,input.sandbox,input.identityKey,input.identityType,input.identityHint || null,input.credentialFingerprint,input.reportedIdentityKey || null],
    );

    const newVersion = Number(account.rows[0]?.credential_version || 1);
    await client.query(
      `INSERT INTO exchange_credential_history(
         user_id, exchange, sandbox, action, previous_version, new_version,
         previous_credential_fingerprint, new_credential_fingerprint,
         previous_identity_key, new_identity_key,
         previous_reported_identity_key, new_reported_identity_key,
         previous_identity_type, new_identity_type
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        user.id, input.exchange, input.sandbox, previousCredential.rows[0] ? (previousCredential.rows[0].credential_fingerprint === input.credentialFingerprint ? 'RECONNECTED' : 'ROTATED') : 'CONNECTED',
        previousCredential.rows[0]?.version ? Number(previousCredential.rows[0].version) : null, newVersion,
        previousCredential.rows[0]?.credential_fingerprint || null, input.credentialFingerprint,
        previousCredential.rows[0]?.identity_key || null, input.identityKey,
        previousCredential.rows[0]?.reported_identity_key || null, input.reportedIdentityKey || null,
        previousCredential.rows[0]?.identity_type || null, input.identityType,
      ],
    );
    return { exchangeAccountId: account.rows[0]?.id, credentialVersion: newVersion, reportedIdentityKey: input.reportedIdentityKey };
  });
}

export async function getExchangeCredential(firebaseUid: string, exchange: string) {
  const result = await dbQuery<any>(`SELECT ec.ciphertext,ec.iv,ec.auth_tag,ec.sandbox,ec.status,ec.version,ea.identity_key,ea.identity_type,ea.identity_hint,ea.credential_fingerprint,ea.reported_identity_key,ea.id AS exchange_account_id FROM exchange_credentials ec JOIN users u ON u.id=ec.user_id LEFT JOIN exchange_accounts ea ON ea.user_id=ec.user_id AND lower(ea.exchange)=lower(ec.exchange) WHERE u.firebase_uid=$1 AND ec.exchange=$2 AND ec.status='ACTIVE'`, [firebaseUid,exchange]);
  return result.rows[0] || null;
}

export async function getExchangeCredentialHistory(firebaseUid: string, exchange?: string) {
  const result = await dbQuery<any>(
    `SELECT h.exchange, h.sandbox, h.action, h.previous_version, h.new_version,
            h.previous_identity_type, h.new_identity_type, h.created_at
       FROM exchange_credential_history h
       JOIN users u ON u.id = h.user_id
      WHERE u.firebase_uid = $1
        AND ($2::text IS NULL OR lower(h.exchange) = lower($2))
      ORDER BY h.created_at DESC
      LIMIT 25`,
    [firebaseUid, exchange || null],
  );
  return result.rows;
}

export async function deleteExchangeCredential(firebaseUid: string, exchange: string) {
  await dbTransaction(async (client) => {
    await client.query(`UPDATE exchange_credentials ec SET status='REVOKED',updated_at=now() FROM users u WHERE ec.user_id=u.id AND u.firebase_uid=$1 AND lower(ec.exchange)=lower($2)`, [firebaseUid,exchange]);
    await client.query(`UPDATE exchange_accounts ea SET status='REVOKED',updated_at=now() FROM users u WHERE ea.user_id=u.id AND u.firebase_uid=$1 AND lower(ea.exchange)=lower($2)`, [firebaseUid,exchange]);
  });
}

export async function getUserByMemberId(memberId: string) {
  const result = await dbQuery<any>('SELECT * FROM users WHERE member_id=$1', [memberId]);
  return result.rows[0] || null;
}

export async function consumeTotpCounter(firebaseUid: string, counter: number): Promise<boolean> {
  const result = await dbQuery<any>(
    `UPDATE security_credentials s SET last_totp_counter=$2, updated_at=now()
      FROM users u
     WHERE s.user_id=u.id AND u.firebase_uid=$1 AND (s.last_totp_counter IS NULL OR s.last_totp_counter < $2)
     RETURNING s.user_id`,
    [firebaseUid, counter],
  );
  return result.rows.length > 0;
}

export async function applyBotFillToPosition(input: { externalBotId: string; symbol: string; side: 'buy'|'sell'; quantity: number; price: number; feeAmount?: number }) {
  return dbTransaction(async (client) => {
    const bot = await client.query(`SELECT id FROM bots WHERE external_bot_id=$1 FOR UPDATE`, [input.externalBotId]);
    if (!bot.rows[0]) return null;
    const current = await client.query(`SELECT * FROM positions WHERE bot_id=$1 AND symbol=$2 FOR UPDATE`, [bot.rows[0].id,input.symbol]);
    const row = current.rows[0];
    const qty=Number(input.quantity); const price=Number(input.price); const fee=Number(input.feeAmount||0);
    if(!row) {
      if(input.side==='sell') return null;
      const created=await client.query(`INSERT INTO positions(bot_id,symbol,quantity,average_entry,realized_pnl,unrealized_pnl,total_fees) VALUES($1,$2,$3,$4,0,0,$5) RETURNING *`, [bot.rows[0].id,input.symbol,qty,price,fee]);
      return created.rows[0];
    }
    const oldQty=Number(row.quantity); const oldAvg=Number(row.average_entry); let newQty=oldQty; let newAvg=oldAvg; let realized=Number(row.realized_pnl);
    if(input.side==='buy') { newQty=oldQty+qty; newAvg=newQty>0?((oldQty*oldAvg)+(qty*price))/newQty:0; }
    else { const sold=Math.min(qty,oldQty); realized += (price-oldAvg)*sold-fee; newQty=Math.max(0,oldQty-qty); if(newQty===0)newAvg=0; }
    const updated=await client.query(`UPDATE positions SET quantity=$3,average_entry=$4,realized_pnl=$5,total_fees=total_fees+$6,updated_at=now() WHERE bot_id=$1 AND symbol=$2 RETURNING *`, [bot.rows[0].id,input.symbol,newQty,newAvg,realized,fee]);
    return updated.rows[0];
  });
}

export async function topupGasAtomic(input: { firebaseUid: string; amount: number; idempotencyKey?: string }) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error('Gas top-up amount must be positive and finite.'), { code: 'GAS_TOPUP_AMOUNT_INVALID' });
  if (amount > 1_000_000) throw Object.assign(new Error('Gas top-up amount exceeds the configured safety limit.'), { code: 'GAS_TOPUP_AMOUNT_LIMIT' });
  if (!input.idempotencyKey?.trim()) throw Object.assign(new Error('Gas top-up idempotency key is required.'), { code: 'GAS_TOPUP_IDEMPOTENCY_REQUIRED' });
  return dbTransaction(async (client) => {
    const idempotencyKey = input.idempotencyKey?.trim().slice(0, 128) || null;
    if (idempotencyKey) {
      const replay = await client.query(
        `SELECT id, balance_after, metadata
           FROM wallet_ledger
          WHERE idempotency_key = $1
          LIMIT 1`,
        [idempotencyKey],
      );
      if (replay.rows[0]) {
        const metadata = replay.rows[0].metadata || {};
        return {
          replayed: true,
          ledgerId: replay.rows[0].id,
          newBalance: Number(replay.rows[0].balance_after),
          newGasReserve: Number(metadata.newGasReserve || 0),
          bonusUsdt: Number(metadata.bonusUsdt || 0),
          referralBonusUsdt: Number(metadata.referralBonusUsdt || 0),
        };
      }
    }

    const user = await client.query(`SELECT id, sponsor_user_id FROM users WHERE firebase_uid=$1 FOR UPDATE`, [input.firebaseUid]);
    if (!user.rows[0]) throw Object.assign(new Error('Account not provisioned.'), { code: 'ACCOUNT_NOT_PROVISIONED' });
    const { bonusUsdt } = getGasTopupBonus(amount);
    const wallet = await client.query(`SELECT * FROM wallet_accounts WHERE user_id=$1 AND currency='USDT' FOR UPDATE`, [user.rows[0].id]);
    if (!wallet.rows[0] || Number(wallet.rows[0].available_balance) < amount) {
      throw Object.assign(new Error('Insufficient available balance.'), { code: 'INSUFFICIENT_BALANCE' });
    }

    const before = Number(wallet.rows[0].available_balance);
    const after = before - amount;
    const newGasReserve = Number(wallet.rows[0].gas_reserve) + amount + bonusUsdt;
    const newNonCashGas = Number(wallet.rows[0].non_cash_gas_bonus) + bonusUsdt;
    await client.query(
      `UPDATE wallet_accounts
          SET available_balance=$2,
              total_outflow=total_outflow+$3,
              gas_reserve=$4,
              non_cash_gas_bonus=$5,
              version=version+1,
              updated_at=now()
        WHERE id=$1`,
      [wallet.rows[0].id, after, amount, newGasReserve, newNonCashGas],
    );

    const ledger = await client.query(
      `INSERT INTO wallet_ledger(account_id,direction,amount,balance_before,balance_after,entry_type,description,idempotency_key,metadata)
       VALUES($1,'DEBIT',$2,$3,$4,'GAS_TOPUP','Move available balance into gas reserve',$5,$6::jsonb) RETURNING id`,
      [wallet.rows[0].id, amount, before, after, idempotencyKey, JSON.stringify({ bonusUsdt, newGasReserve, promoVersion: FINANCIAL_CONFIG.version })],
    );

    let referralBonusUsdt = 0;
    const sponsorId = user.rows[0].sponsor_user_id;
    if (sponsorId) {
      referralBonusUsdt = Number((amount * FINANCIAL_CONFIG.referral.topupGasNonCashPct / 100).toFixed(10));
      if (referralBonusUsdt > 0) {
        const sponsorWallet = await client.query(
          `SELECT id, gas_reserve, non_cash_gas_bonus FROM wallet_accounts WHERE user_id=$1 AND currency='USDT' FOR UPDATE`,
          [sponsorId],
        );
        if (sponsorWallet.rows[0]) {
          const sponsorGas = Number(sponsorWallet.rows[0].gas_reserve) + referralBonusUsdt;
          const sponsorNonCash = Number(sponsorWallet.rows[0].non_cash_gas_bonus) + referralBonusUsdt;
          await client.query(
            `UPDATE wallet_accounts SET gas_reserve=$2, non_cash_gas_bonus=$3, version=version+1, updated_at=now() WHERE id=$1`,
            [sponsorWallet.rows[0].id, sponsorGas, sponsorNonCash],
          );
          await client.query(
            `INSERT INTO wallet_ledger(account_id,direction,amount,balance_before,balance_after,entry_type,reference_type,reference_id,description,metadata)
             VALUES($1,'CREDIT',$2,$3,$4,'REFERRAL_TOPUP_GAS','GAS_TOPUP',$5,$6,$7::jsonb)`,
            [sponsorWallet.rows[0].id, referralBonusUsdt, Number(sponsorWallet.rows[0].gas_reserve), sponsorGas, ledger.rows[0].id, '10% non-cash referral gas reward', JSON.stringify({ sourceUserId: user.rows[0].id, pct: FINANCIAL_CONFIG.referral.topupGasNonCashPct })],
          );
          await client.query(
            `INSERT INTO referral_events(sponsor_user_id,source_user_id,event_type,gross_amount,reward_amount,cashable,metadata)
             VALUES($1,$2,'TOPUP',$3,$4,false,$5)`,
            [sponsorId, user.rows[0].id, amount, referralBonusUsdt, JSON.stringify({ gasTopupLedgerId: ledger.rows[0].id })],
          );
        }
      }
    }

    return { replayed: false, ledgerId: ledger.rows[0].id, newBalance: after, newGasReserve, bonusUsdt, referralBonusUsdt };
  });
}

export async function getProfitShareSummary(firebaseUid: string) {
  const result = await dbQuery<any>(
    `SELECT
       COALESCE(SUM(CASE WHEN event_type='ACTIVATION' AND cashable THEN reward_amount ELSE 0 END),0) AS activation_cash,
       COALESCE(SUM(CASE WHEN event_type='TRADING_FEE' AND cashable THEN reward_amount ELSE 0 END),0) AS trading_fee_cash,
       COALESCE(SUM(CASE WHEN event_type='TOPUP' AND NOT cashable THEN reward_amount ELSE 0 END),0) AS topup_non_cash,
       COALESCE(SUM(CASE WHEN cashable THEN reward_amount ELSE 0 END),0) AS total_cash,
       COUNT(*) AS event_count
       FROM referral_events re
       JOIN users sponsor ON sponsor.id=re.sponsor_user_id
      WHERE sponsor.firebase_uid=$1`,
    [firebaseUid],
  );
  const row = result.rows[0] || {};
  return {
    activationCashUsdt: Number(row.activation_cash || 0),
    tradingFeeCashUsdt: Number(row.trading_fee_cash || 0),
    topupNonCashUsdt: Number(row.topup_non_cash || 0),
    totalCashUsdt: Number(row.total_cash || 0),
    eventCount: Number(row.event_count || 0),
  };
}

export async function getGasAutoRefillConfig(firebaseUid: string) {
  const result = await dbQuery<any>(
    `SELECT g.* FROM gas_auto_refill_configs g JOIN users u ON u.id=g.user_id WHERE u.firebase_uid=$1`,
    [firebaseUid],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    enabled: Boolean(row.enabled), thresholdUsdt: Number(row.threshold_usdt), refillUsdt: Number(row.refill_usdt),
    maxDailyUsdt: Number(row.max_daily_usdt), dailyRefilledUsdt: Number(row.daily_refilled_usdt), lastRefilledAt: row.last_refilled_at ? new Date(row.last_refilled_at).getTime() : null,
  };
}

export async function upsertGasAutoRefillConfig(input: { firebaseUid: string; enabled: boolean; thresholdUsdt: number; refillUsdt: number; maxDailyUsdt: number }) {
  const user = await getUserByFirebaseUid(input.firebaseUid);
  if (!user) throw Object.assign(new Error('Account not provisioned.'), { code: 'ACCOUNT_NOT_PROVISIONED' });
  await dbQuery(
    `INSERT INTO gas_auto_refill_configs(user_id,enabled,threshold_usdt,refill_usdt,max_daily_usdt)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,threshold_usdt=EXCLUDED.threshold_usdt,refill_usdt=EXCLUDED.refill_usdt,max_daily_usdt=EXCLUDED.max_daily_usdt,updated_at=now()`,
    [user.id, input.enabled, input.thresholdUsdt, input.refillUsdt, input.maxDailyUsdt],
  );
  return getGasAutoRefillConfig(input.firebaseUid);
}

export async function processGasAutoRefills() {
  return dbTransaction(async (client) => {
    const configs = await client.query(`SELECT g.*,u.firebase_uid FROM gas_auto_refill_configs g JOIN users u ON u.id=g.user_id WHERE g.enabled=true FOR UPDATE`);
    const results: any[] = [];
    for (const config of configs.rows) {
      const wallet = await client.query(`SELECT * FROM wallet_accounts WHERE user_id=$1 AND currency='USDT' FOR UPDATE`, [config.user_id]);
      if (!wallet.rows[0]) continue;
      const today = new Date().toISOString().slice(0,10);
      let daily = String(config.daily_refill_date || '').slice(0,10) === today ? Number(config.daily_refilled_usdt) : 0;
      if (Number(wallet.rows[0].gas_reserve) >= Number(config.threshold_usdt) || daily >= Number(config.max_daily_usdt)) continue;
      const amount = Math.min(Number(config.refill_usdt), Number(config.max_daily_usdt) - daily, Number(wallet.rows[0].available_balance));
      if (!(amount > 0)) continue;
      const before = Number(wallet.rows[0].available_balance), after = before - amount;
      const gas = Number(wallet.rows[0].gas_reserve) + amount;
      await client.query(`UPDATE wallet_accounts SET available_balance=$2,total_outflow=total_outflow+$3,gas_reserve=$4,version=version+1,updated_at=now() WHERE id=$1`, [wallet.rows[0].id,after,amount,gas]);
      await client.query(`INSERT INTO wallet_ledger(account_id,direction,amount,balance_before,balance_after,entry_type,description,metadata) VALUES($1,'DEBIT',$2,$3,$4,'GAS_AUTO_REFILL','Automatic gas reserve refill',$5::jsonb)`, [wallet.rows[0].id,amount,before,after,JSON.stringify({thresholdUsdt:Number(config.threshold_usdt),refillUsdt:amount})]);
      await client.query(`UPDATE gas_auto_refill_configs SET daily_refilled_usdt=$2,daily_refill_date=CURRENT_DATE,last_refilled_at=now(),updated_at=now() WHERE user_id=$1`, [config.user_id,daily+amount]);
      results.push({ firebaseUid: config.firebase_uid, amount, gasReserve: gas });
    }
    return results;
  });
}

export async function settleWithdrawal(input: { withdrawalId: string; txHash: string; verifiedAt?: string; metadata?: Record<string, unknown> }) {
  return dbTransaction(async (client) => {
    const row=await client.query(`SELECT w.*,wa.id AS account_id,wa.locked_balance FROM withdrawals w JOIN wallet_accounts wa ON wa.user_id=w.user_id AND wa.currency=w.currency WHERE w.id=$1 FOR UPDATE`,[input.withdrawalId]);
    if(!row.rows[0]) throw Object.assign(new Error('Withdrawal not found.'),{code:'WITHDRAWAL_NOT_FOUND'});
    const w=row.rows[0]; if(['CONFIRMED','SENT'].includes(w.status)) return {replayed:true,status:w.status,txHash:w.tx_hash};
    const locked=Math.max(0,Number(w.locked_balance)-Number(w.amount));
    await client.query(`UPDATE wallet_accounts SET locked_balance=$2,version=version+1,updated_at=now() WHERE id=$1`,[w.account_id,locked]);
    await client.query(`UPDATE withdrawals SET status='SENT',tx_hash=$2,processed_at=now(),settlement_verified_at=$3,metadata=metadata || $4::jsonb WHERE id=$1`,[input.withdrawalId,input.txHash,input.verifiedAt || new Date().toISOString(),JSON.stringify(input.metadata || {})]);
    return {replayed:false,status:'SENT',txHash:input.txHash};
  });
}

export async function rejectWithdrawal(withdrawalId: string, reason: string) {
  return dbTransaction(async (client) => {
    const row=await client.query(`SELECT w.*,wa.id AS account_id,wa.available_balance,wa.locked_balance FROM withdrawals w JOIN wallet_accounts wa ON wa.user_id=w.user_id AND wa.currency=w.currency WHERE w.id=$1 FOR UPDATE`,[withdrawalId]);
    if(!row.rows[0]) throw Object.assign(new Error('Withdrawal not found.'),{code:'WITHDRAWAL_NOT_FOUND'});
    const w=row.rows[0]; if(['REJECTED','CANCELLED'].includes(w.status)) return {replayed:true,status:w.status};
    const available=Number(w.available_balance)+Number(w.amount); const locked=Math.max(0,Number(w.locked_balance)-Number(w.amount));
    await client.query(`UPDATE wallet_accounts SET available_balance=$2,locked_balance=$3,total_inflow=total_inflow+$4,version=version+1,updated_at=now() WHERE id=$1`,[w.account_id,available,locked,w.amount]);
    const reversal = await client.query(`INSERT INTO wallet_ledger(account_id,direction,amount,balance_before,balance_after,entry_type,reference_type,reference_id,description,metadata) VALUES($1,'CREDIT',$2,$3,$4,'WITHDRAWAL_REJECTED_REVERSAL','WITHDRAWAL',$5,$6,$7) RETURNING id`,[w.account_id,w.amount,Number(w.available_balance),available,withdrawalId,`Reversal of withdrawal hold: ${reason.slice(0,400)}`,JSON.stringify({originalEntryType:'WITHDRAWAL_HOLD'})]);
    await client.query(`UPDATE withdrawals SET status='REJECTED',failure_reason=$2,rejection_reversal_ledger_id=$3,processed_at=now() WHERE id=$1`,[withdrawalId,reason.slice(0,500),reversal.rows[0].id]);
    return {replayed:false,status:'REJECTED',reversalLedgerId:reversal.rows[0].id};
  });
}
