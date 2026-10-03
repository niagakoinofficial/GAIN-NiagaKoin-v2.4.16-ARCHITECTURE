import { createConnection, type Socket } from 'node:net';

interface RedisUrl { host: string; port: number; password?: string; database?: number }

function parseRedisUrl(raw = ''): RedisUrl | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'redis:' && u.protocol !== 'rediss:') return null;
    return { host: u.hostname || '127.0.0.1', port: Number(u.port || 6379), password: u.password ? decodeURIComponent(u.password) : undefined, database: u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : undefined };
  } catch { return null; }
}

function getRedisConfig(): RedisUrl | null {
  return parseRedisUrl(process.env.REDIS_URL || '');
}

function encode(parts: string[]): Buffer {
  return Buffer.from(`*${parts.length}\r\n${parts.map((p) => `$${Buffer.byteLength(p)}\r\n${p}\r\n`).join('')}`);
}

function readReply(socket: Socket): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      data = Buffer.concat([data, chunk]);
      const lineEnd = data.indexOf('\r\n');
      if (lineEnd < 0) return;
      const type = data[0];
      if (type === 36) {
        const len = Number(data.subarray(1, lineEnd).toString());
        if (len === -1) { cleanup(); resolve(null); return; }
        const total = lineEnd + 2 + len + 2;
        if (data.length < total) return;
        cleanup(); resolve(data.subarray(lineEnd + 2, lineEnd + 2 + len).toString()); return;
      }
      const line = data.subarray(1, lineEnd).toString();
      cleanup();
      if (type === 45) reject(new Error(line));
      else if (type === 58) resolve(Number(line));
      else resolve(line);
    };
    const cleanup = () => { socket.off('data', onData); socket.off('error', onError); socket.off('timeout', onTimeout); };
    const onError = (e: Error) => { cleanup(); reject(e); };
    const onTimeout = () => { cleanup(); socket.destroy(); reject(new Error('Redis timeout')); };
    socket.on('data', onData); socket.once('error', onError); socket.once('timeout', onTimeout); socket.setTimeout(1500);
  });
}

async function command(parts: string[]): Promise<any> {
  const config = getRedisConfig();
  if (!config) throw new Error('Redis is not configured');

  const socket = createConnection({
    host: config.host,
    port: config.port,
  });

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('error', reject);
      socket.setTimeout(
        1500,
        () => reject(new Error('Redis connect timeout'))
      );
    });

    const auth = config.password
      ? encode(['AUTH', config.password])
      : null;

    if (auth) {
      socket.write(auth);
      await readReply(socket);
    }

    if (
      config.database !== undefined &&
      Number.isInteger(config.database)
    ) {
      socket.write(
        encode(['SELECT', String(config.database)])
      );
      await readReply(socket);
    }

    socket.write(encode(parts));
    return await readReply(socket);
  } finally {
    socket.end();
  }
}

export async function redisAvailable(): Promise<boolean> {
  if (!getRedisConfig()) return false;
  try {
    return String(await command(['PING'])) === 'PONG';
  } catch {
    return false;
  }
}

export async function redisGet(key: string): Promise<string | null> { try { const v = await command(['GET', key]); return v == null ? null : String(v); } catch { return null; } }
export async function redisSetEx(key: string, value: string, ttlSeconds: number): Promise<boolean> { try { return String(await command(['SET', key, value, 'EX', String(ttlSeconds)])) === 'OK'; } catch { return false; } }
export async function redisSetNxEx(key: string, value: string, ttlSeconds: number): Promise<boolean> { try { return String(await command(['SET', key, value, 'NX', 'EX', String(ttlSeconds)])) === 'OK'; } catch { return false; } }
export async function redisDel(key: string): Promise<boolean> { try { await command(['DEL', key]); return true; } catch { return false; } }
export async function redisIncr(key: string): Promise<number | null> { try { const v = await command(['INCR', key]); return Number(v); } catch { return null; } }
export async function redisExpire(key: string, ttlSeconds: number): Promise<boolean> { try { await command(['EXPIRE', key, String(ttlSeconds)]); return true; } catch { return false; } }
