import type { MarketSnapshot } from '../../domain/strategy/types';
import { MarketDataEngine } from './MarketDataEngine';

interface Connection {
  ws: WebSocket;
  exchange: string;
  symbol: string;
  isSandbox: boolean;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  firstMessageLogged?: boolean;
}

function binanceSymbol(symbol: string) { return symbol.replace('/', '').toLowerCase(); }
function bitgetSymbol(symbol: string) { return symbol.replace('/', '').toUpperCase(); }
function okxSymbol(symbol: string) { return symbol.replace('/', '-').toUpperCase(); }

/** Native WebSocket market-data gateway. It is intentionally read-only: orders never travel over this channel. */
export class WebSocketManager {
  private readonly connections = new Map<string, Connection>();
  constructor(private readonly marketData: MarketDataEngine) {}

  connect(exchange: string, symbol: string, isSandbox = false): void {
    const normalized = exchange.toLowerCase();
    const key = `${normalized}:${symbol}:${isSandbox ? 'sandbox' : 'live'}`;

    if (this.connections.has(key)) return;

    const url = normalized === 'binance'
      ? isSandbox
        ? `wss://stream.testnet.binance.vision/ws/${binanceSymbol(symbol)}@ticker`
        : `wss://stream.binance.com:9443/ws/${binanceSymbol(symbol)}@ticker`
      : normalized === 'okx'
        ? 'wss://ws.okx.com:8443/ws/v5/public'
        : normalized === 'bitget'
          ? (isSandbox ? 'wss://wspap.bitget.com/v3/ws/public' : 'wss://ws.bitget.com/v3/ws/public')
          : '';

    if (!url) {
      console.info('[GAIN_V2_WS_UNSUPPORTED]', { exchange: normalized, symbol, isSandbox, reason: 'No verified native public WebSocket adapter' });
      return;
    }

    console.info('[GAIN_V2_WS_CONNECT]', {
      exchange: normalized,
      symbol,
      isSandbox,
      url,
    });

    const ws = new WebSocket(url);

    const connection: Connection = {
      ws,
      exchange: normalized,
      symbol,
      isSandbox,
      firstMessageLogged: false,
    };
    this.connections.set(key, connection);
    ws.onopen = () => {
      console.info('[GAIN_V2_WS_OPEN]', {
        exchange: normalized,
        symbol,
        isSandbox,
        url,
      });
      if (normalized === 'okx') ws.send(JSON.stringify({ op:'subscribe', args:[{ channel:'tickers', instId:okxSymbol(symbol) }] }));
      if (normalized === 'bitget') ws.send(JSON.stringify({ op:'subscribe', args:[{ instType:'spot', topic:'ticker', symbol:bitgetSymbol(symbol) }] }));
    };
    ws.onmessage = (event) => {
      if (!connection.firstMessageLogged) {
        connection.firstMessageLogged = true;
        let preview = '';
        try {
          preview = String(event.data).slice(0, 300);
        } catch {
          preview = '[unreadable message]';
        }

        console.info('[GAIN_V2_WS_MESSAGE]', {
          exchange: normalized,
          symbol,
          isSandbox,
          preview,
        });
      }
      try {
        const raw = JSON.parse(String(event.data));
        const tick = this.normalize(normalized, symbol, raw);
        if (tick) this.marketData.publish(tick);
      } catch { /* malformed feed is ignored; REST reconciliation remains authoritative */ }
    };
    ws.onerror = (error) => {
      console.warn('[GAIN_V2_WS_ERROR]', {
        exchange: normalized,
        symbol,
        isSandbox,
        url,
        message: String((error as any)?.message || 'WebSocket error'),
      });

      this.scheduleReconnect(key);
    };
    ws.onclose = (event) => {
      console.warn('[GAIN_V2_WS_CLOSE]', {
        exchange: normalized,
        symbol,
        isSandbox,
        url,
        code: event.code,
        reason: event.reason || '',
        wasClean: event.wasClean,
      });

      this.scheduleReconnect(key);
    };
  }

  disconnect(exchange: string, symbol: string) {
    const normalized = exchange.toLowerCase();
    const prefix = `${normalized}:${symbol}:`;

    for (const [key, connection] of this.connections.entries()) {
      if (!key.startsWith(prefix)) continue;

      this.connections.delete(key);

      if (connection.reconnectTimer) {
        clearTimeout(connection.reconnectTimer);
        connection.reconnectTimer = undefined;
      }

      try {
        connection.ws.close(1000, 'market data disconnect');
      } catch {}
    }
  }

  private scheduleReconnect(key: string) {
    const connection = this.connections.get(key);
    if (!connection || connection.reconnectTimer) return;
    console.info('[GAIN_V2_WS_RECONNECT_SCHEDULED]', {
      exchange: connection.exchange,
      symbol: connection.symbol,
      isSandbox: connection.isSandbox,
      delayMs: 1000,
    });

    connection.reconnectTimer = setTimeout(() => {
      this.connections.delete(key);
      this.connect(
        connection.exchange,
        connection.symbol,
        connection.isSandbox
      );
    }, 1000);
  }

  private normalize(exchange: string, symbol: string, raw: any): MarketSnapshot | undefined {
    let last = 0; let bid = 0; let ask = 0; let timestamp = Date.now(); let percentage = 0;
    if (exchange === 'binance') {
      last = Number(raw.c); bid = Number(raw.b); ask = Number(raw.a); timestamp = Number(raw.E) || Date.now();
      const open = Number(raw.o); percentage = open > 0 ? ((last - open) / open) * 100 : 0;
    } else {
      const data = Array.isArray(raw?.data) ? raw.data[0] : raw?.data;
      last = Number(data?.last); bid = Number(data?.bidPr); ask = Number(data?.askPr); timestamp = Number(raw?.ts || data?.ts) || Date.now();
      if (exchange === 'okx') { last = Number(data?.last); bid = Number(data?.bidPx); ask = Number(data?.askPx); }
      if (exchange === 'bitget') { last = Number(data?.lastPrice); bid = Number(data?.bid1Price); ask = Number(data?.ask1Price); const open = Number(data?.openPrice24h); percentage = open > 0 ? ((last - open) / open) * 100 : Number(data?.price24hPcnt || 0) * 100; }
    }
    if (!(last > 0) || !(bid > 0) || !(ask > 0)) return undefined;
    return { exchange, symbol, bid, ask, last, timestamp, spreadPct: ((ask - bid) / last) * 100, volatilityPct: Math.abs(percentage) };
  }
}
