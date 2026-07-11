import { env } from '../env.js';

// Fire-and-forget sale ping to NOTIFY_WEBHOOK (Discord-compatible; also works
// with any endpoint that accepts JSON). Never throws into the request path.
export function notifySale(sale: {
	channel: 'stripe' | 'crypto';
	tier: string;
	amount: string | number;
	currency: string; // USD | USDC
	period?: string; // e.g. "12 mo"
	chain?: string; // solana | base
}): void {
	if (!env.NOTIFY_WEBHOOK) return;
	const emoji = sale.channel === 'crypto' ? '🪙' : '💳';
	const via = sale.channel === 'crypto' ? `crypto${sale.chain ? ` · ${sale.chain}` : ''}` : 'card';
	const title = `${emoji} New Flash Props sale — ${sale.tier}`;
	const line = `${sale.amount} ${sale.currency}${sale.period ? ` · ${sale.period}` : ''} · ${via}`;
	const body = {
		content: `${title}\n${line}`,
		embeds: [{ title, description: line, color: 0xf58426, footer: { text: 'Flash Props API' } }]
	};
	// Do not await — best-effort, must not delay or fail the checkout response.
	void fetch(env.NOTIFY_WEBHOOK, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	}).catch(() => {});
}
