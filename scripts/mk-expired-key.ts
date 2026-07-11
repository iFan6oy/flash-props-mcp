// Dev helper: mint a key that's already expired, to test 402 enforcement.
import { ensureSchema } from '../src/db/client.js';
import { createApiKey } from '../src/auth/keys.js';
ensureSchema();
const { key } = createApiKey({ tier: 'pro', label: 'expiry-test', mode: 'test', expiresAt: Date.now() - 1000 });
console.log(key);
