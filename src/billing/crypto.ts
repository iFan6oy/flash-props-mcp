// Pay-with-crypto via Solana Pay (USDC). No processor: the user sends USDC to
// RECEIVE_WALLET with a unique on-chain reference, we watch the chain for that
// exact payment, then provision a prepaid (expiring) API key.
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { env } from '../env.js';
import { db } from '../db/client.js';
import { apiKeys, cryptoOrders } from '../db/schema.js';
import { createApiKey } from '../auth/keys.js';
import type { TierId } from '../config/tiers.js';
import { cryptoEnabled, cryptoPriceUsdc, cryptoPeriod, toBaseUnits, USDC_DECIMALS } from '../config/crypto.js';

const ORDER_WINDOW_MS = 30 * 60 * 1000; // 30 min to pay

export type CryptoOrder = typeof cryptoOrders.$inferSelect;

let _conn: Connection | null = null;
function conn(): Connection {
	if (!_conn) _conn = new Connection(env.SOLANA_RPC_URL, 'confirmed');
	return _conn;
}

// Build the Solana Pay transfer-request URL (scannable by Phantom/Solflare).
export function solanaPayUrl(order: CryptoOrder): string {
	const params = new URLSearchParams({
		amount: order.amountUsdc,
		'spl-token': env.USDC_MINT,
		reference: order.reference,
		label: 'Flash Props API',
		message: `Flash Props ${order.tier} — ${order.months} mo`
	});
	return `solana:${env.RECEIVE_WALLET}?${params.toString()}`;
}

export function createCryptoOrder(tier: TierId, months: number): CryptoOrder | { error: string } {
	if (!cryptoEnabled()) return { error: 'crypto_not_configured' };
	const price = cryptoPriceUsdc(tier, months);
	if (price === null) return { error: 'tier_not_purchasable' };
	// Validate the receive wallet is a real pubkey before quoting a payment.
	try {
		new PublicKey(env.RECEIVE_WALLET);
	} catch {
		return { error: 'bad_receive_wallet' };
	}
	const now = Date.now();
	const row = {
		id: `ord_${nanoid(16)}`,
		reference: Keypair.generate().publicKey.toBase58(),
		tier,
		months,
		amountUsdc: price.toFixed(USDC_DECIMALS > 2 ? 2 : USDC_DECIMALS),
		status: 'pending' as const,
		keyId: null,
		signature: null,
		createdAt: now,
		expiresAt: now + ORDER_WINDOW_MS,
		paidAt: null
	};
	db.insert(cryptoOrders).values(row).run();
	return row;
}

export function getOrder(id: string): CryptoOrder | null {
	const o = db.select().from(cryptoOrders).where(eq(cryptoOrders.id, id)).get();
	return o ?? null;
}

// Look on-chain for a confirmed USDC payment to RECEIVE_WALLET carrying this
// order's reference, of at least the quoted amount. Returns the tx signature.
export async function findPayment(order: CryptoOrder): Promise<string | null> {
	const reference = new PublicKey(order.reference);
	const receive = new PublicKey(env.RECEIVE_WALLET);
	const required = toBaseUnits(Number(order.amountUsdc));

	const sigs = await conn().getSignaturesForAddress(reference, { limit: 10 }, 'confirmed');
	for (const s of sigs) {
		if (s.err) continue;
		const tx = await conn().getParsedTransaction(s.signature, {
			maxSupportedTransactionVersion: 0,
			commitment: 'confirmed'
		});
		if (!tx || tx.meta?.err) continue;

		// Net USDC credited to any token account owned by RECEIVE_WALLET.
		const post = tx.meta?.postTokenBalances ?? [];
		const pre = tx.meta?.preTokenBalances ?? [];
		let credited = 0n;
		for (const pb of post) {
			if (pb.mint !== env.USDC_MINT || pb.owner !== receive.toBase58()) continue;
			const postAmt = BigInt(pb.uiTokenAmount.amount);
			const preMatch = pre.find((x) => x.accountIndex === pb.accountIndex);
			const preAmt = preMatch ? BigInt(preMatch.uiTokenAmount.amount) : 0n;
			credited += postAmt - preAmt;
		}
		if (credited >= required) return s.signature;
	}
	return null;
}

// Idempotently provision a prepaid key for a paid order. Plaintext key is
// returned only the first time (we never store it).
export function provisionCryptoKey(
	order: CryptoOrder,
	signature: string
): { key?: string; prefix: string; created: boolean; expiresAt: number } {
	if (order.keyId) {
		const existing = db.select().from(apiKeys).where(eq(apiKeys.id, order.keyId)).get();
		return {
			prefix: existing?.keyPrefix ?? '',
			created: false,
			expiresAt: existing?.expiresAt ?? Date.now()
		};
	}
	const days = order.months >= 12 ? 365 : order.months * 30;
	const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
	const { record, key } = createApiKey({
		tier: order.tier as TierId,
		label: `crypto-${order.months}mo`,
		mode: 'live',
		expiresAt
	});
	db.update(cryptoOrders)
		.set({ status: 'paid', keyId: record.id, signature, paidAt: Date.now() })
		.where(eq(cryptoOrders.id, order.id))
		.run();
	return { key, prefix: record.keyPrefix, created: true, expiresAt };
}

// Mark an unpaid order past its window as expired (best-effort).
export function expireIfStale(order: CryptoOrder): CryptoOrder {
	if (order.status === 'pending' && Date.now() > order.expiresAt) {
		db.update(cryptoOrders).set({ status: 'expired' }).where(eq(cryptoOrders.id, order.id)).run();
		return { ...order, status: 'expired' };
	}
	return order;
}

// A period id ('month'|'year') → months, for the checkout entrypoint.
export function monthsForPeriod(periodId: string): number | null {
	return cryptoPeriod(periodId)?.months ?? null;
}
