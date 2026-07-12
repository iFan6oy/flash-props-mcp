// One-time, in-memory reveal store for freshly-minted keys. Bridges the race
// where the checkout.session.completed webhook provisions a key BEFORE the
// buyer's browser lands on /billing/success: the webhook stashes the plaintext
// here, and /success reveals it once. Plaintext never touches the DB (we only
// persist hashes) and entries self-expire, so this is a short-lived hand-off,
// not storage.
//
// Trade-off: in-memory means a process restart inside the TTL window drops a
// pending reveal — the buyer then relies on the Discord sale ping plus the email
// delivery fast-follow. Fine at current volume; swap for a DB/Redis-backed store
// if reveal reliability ever needs to survive restarts.

interface Reveal {
	key: string;
	expiresAt: number; // epoch ms
}

const TTL_MS = 20 * 60 * 1000; // 20 min
const store = new Map<string, Reveal>(); // keyed by Stripe customer id

function sweep(now: number): void {
	for (const [k, v] of store) if (now >= v.expiresAt) store.delete(k);
}

export function stashReveal(customerId: string, key: string): void {
	if (!customerId || !key) return;
	const now = Date.now();
	sweep(now);
	store.set(customerId, { key, expiresAt: now + TTL_MS });
}

// Return the plaintext once, then delete it (single use). Null if none/expired.
export function takeReveal(customerId: string): string | null {
	if (!customerId) return null;
	const now = Date.now();
	sweep(now);
	const hit = store.get(customerId);
	if (!hit) return null;
	store.delete(customerId);
	return hit.expiresAt > now ? hit.key : null;
}
