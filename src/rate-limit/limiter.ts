// In-memory fixed-window per-minute limiter. Single-process only — swap for a
// Redis/Upstash token bucket when the API runs on more than one instance.

interface Window {
	count: number;
	resetAt: number; // epoch ms
}

const windows = new Map<string, Window>();

export interface RateResult {
	ok: boolean;
	limit: number;
	remaining: number;
	resetAt: number; // epoch ms
	retryAfter?: number; // seconds
}

export function checkPerMinute(keyId: string, limit: number): RateResult {
	const now = Date.now();
	let w = windows.get(keyId);
	if (!w || now >= w.resetAt) {
		w = { count: 0, resetAt: now + 60_000 };
		windows.set(keyId, w);
	}
	if (w.count >= limit) {
		return { ok: false, limit, remaining: 0, resetAt: w.resetAt, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
	}
	w.count += 1;
	return { ok: true, limit, remaining: Math.max(0, limit - w.count), resetAt: w.resetAt };
}

// Periodically drop expired windows so the map doesn't grow unbounded.
let lastSweep = Date.now();
export function sweep(): void {
	const now = Date.now();
	if (now - lastSweep < 5 * 60_000) return;
	lastSweep = now;
	for (const [k, w] of windows) if (now >= w.resetAt) windows.delete(k);
}
