import 'dotenv/config';
import { checkDatabase } from '../src/server/database';
const result = await checkDatabase();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
