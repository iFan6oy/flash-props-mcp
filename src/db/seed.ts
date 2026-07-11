// Seed dev API keys. Run: npm run db:seed
// Prints the plaintext keys ONCE — copy them immediately.
import { db, ensureSchema } from './client.js';
import { apiKeys } from './schema.js';
import { createApiKey } from '../auth/keys.js';

ensureSchema();

const existing = db.select().from(apiKeys).all();
if (existing.length > 0) {
	console.log(`${existing.length} key(s) already exist. Prefixes: ${existing.map((k) => k.keyPrefix).join(', ')}`);
	console.log('Delete the sqlite file to reseed, or add keys via the admin flow.');
	process.exit(0);
}

const pro = createApiKey({ tier: 'pro', label: 'dev-pro', mode: 'test' });
const free = createApiKey({ tier: 'free', label: 'dev-free', mode: 'test' });

console.log('\nSeeded dev keys (shown once — copy them now):\n');
console.log(`  PRO   ${pro.key}`);
console.log(`  FREE  ${free.key}`);
console.log('\nTry it:');
console.log(`  curl -H "Authorization: Bearer ${pro.key}" http://localhost:3860/api/v1/games?sport=mlb\n`);
