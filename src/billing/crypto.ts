// Pay-with-crypto: USDC on Solana (Solana Pay, reference-based) or Base (EVM,
// unique-amount matching via ERC-20 Transfer logs). No processor — funds go
// straight to your wallet; we watch the chain, then provision a prepaid key.
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createPublicClient, http, parseAbiItem, getAddress } from 'viem';
import { base } from 'viem/chains';
import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { env } from '../env.js';
import { db } from '../db/client.js';
import { apiKeys, cryptoOrders } from '../db/schema.js';
import { createApiKey } from '../auth/keys.js';
import type { TierId } from '../config/tiers.js';
import {
	chainEnabled,
	cryptoPriceUsdc,
	cryptoPeriod,
	toBaseUnits,
	USDC_DECIMALS,
	type CryptoChain
} from '../config/crypto.js';

const ORDER_WINDOW_MS = 30 * 60 * 1000; // 30 min to pay

export type CryptoOrder = typeof cryptoOrders.$inferSelect;

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

let _sol: Connection | null = null;
function sol(): Connection {
	if (!_sol) _sol = new Connection(env.SOLANA_RPC_URL, 'confirmed');
	return _sol;
}
function makeEvm() {
	return createPublicClient({ chain: base, transport: http(env.BASE_RPC_URL) });
}
let _evm: ReturnType<typeof makeEvm> | null = null;
function evm(): ReturnType<typeof makeEvm> {
	if (!_evm) _evm = makeEvm();
	return _evm;
}

// Wallet + network + amount the buyer must send.
export function payTarget(order: CryptoOrder): { chain: CryptoChain; address: string; amount: string; url: string } {
	if (order.chain === 'base') {
		const baseUnits = toBaseUnits(Number(order.amountUsdc)).toString();
		return {
			chain: 'base',
			address: env.EVM_RECEIVE_WALLET,
			amount: order.amountUsdc,
			// EIP-681 token transfer request (Base, chainId 8453)
			url: `ethereum:${env.USDC_BASE}@${base.id}/transfer?address=${env.EVM_RECEIVE_WALLET}&uint256=${baseUnits}`
		};
	}
	const params = new URLSearchParams({
		amount: order.amountUsdc,
		'spl-token': env.USDC_MINT,
		reference: order.reference,
		label: 'Flash Props API',
		message: `Flash Props ${order.tier} — ${order.months} mo`
	});
	return { chain: 'solana', address: env.RECEIVE_WALLET, amount: order.amountUsdc, url: `solana:${env.RECEIVE_WALLET}?${params}` };
}

export async function createCryptoOrder(
	tier: TierId,
	months: number,
	chain: CryptoChain
): Promise<CryptoOrder | { error: string }> {
	if (!chainEnabled(chain)) return { error: 'chain_not_configured' };
	const price = cryptoPriceUsdc(tier, months);
	if (price === null) return { error: 'tier_not_purchasable' };

	let reference: string;
	let amountUsdc: string;
	let fromBlock: number | null = null;

	if (chain === 'base') {
		try {
			getAddress(env.EVM_RECEIVE_WALLET);
		} catch {
			return { error: 'bad_receive_wallet' };
		}
		// Uniquify the amount (+ up to ~1c) so each order is identifiable on-chain.
		amountUsdc = (price + randomInt(1, 10_000) / 10 ** USDC_DECIMALS).toFixed(USDC_DECIMALS);
		reference = `bse_${nanoid(24)}`;
		fromBlock = Number(await evm().getBlockNumber());
	} else {
		try {
			new PublicKey(env.RECEIVE_WALLET);
		} catch {
			return { error: 'bad_receive_wallet' };
		}
		amountUsdc = price.toFixed(2);
		reference = Keypair.generate().publicKey.toBase58();
	}

	const now = Date.now();
	const row = {
		id: `ord_${nanoid(16)}`,
		chain,
		reference,
		tier,
		months,
		amountUsdc,
		fromBlock,
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
	return db.select().from(cryptoOrders).where(eq(cryptoOrders.id, id)).get() ?? null;
}

// Solana: find a confirmed USDC payment carrying this order's reference.
async function findSolanaPayment(order: CryptoOrder): Promise<string | null> {
	const reference = new PublicKey(order.reference);
	const receive = new PublicKey(env.RECEIVE_WALLET).toBase58();
	const required = toBaseUnits(Number(order.amountUsdc));
	const sigs = await sol().getSignaturesForAddress(reference, { limit: 10 }, 'confirmed');
	for (const s of sigs) {
		if (s.err) continue;
		const tx = await sol().getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
		if (!tx || tx.meta?.err) continue;
		const post = tx.meta?.postTokenBalances ?? [];
		const pre = tx.meta?.preTokenBalances ?? [];
		let credited = 0n;
		for (const pb of post) {
			if (pb.mint !== env.USDC_MINT || pb.owner !== receive) continue;
			const preMatch = pre.find((x) => x.accountIndex === pb.accountIndex);
			credited += BigInt(pb.uiTokenAmount.amount) - (preMatch ? BigInt(preMatch.uiTokenAmount.amount) : 0n);
		}
		if (credited >= required) return s.signature;
	}
	return null;
}

// Base: find an ERC-20 USDC Transfer to the receive wallet of the exact
// (unique) order amount, since the order's fromBlock.
async function findBasePayment(order: CryptoOrder): Promise<string | null> {
	const required = toBaseUnits(Number(order.amountUsdc));
	const logs = await evm().getLogs({
		address: getAddress(env.USDC_BASE),
		event: TRANSFER_EVENT,
		args: { to: getAddress(env.EVM_RECEIVE_WALLET) },
		fromBlock: BigInt(order.fromBlock ?? 0),
		toBlock: 'latest'
	});
	const hit = logs.find((l) => l.args.value === required);
	return hit?.transactionHash ?? null;
}

export async function findPayment(order: CryptoOrder): Promise<string | null> {
	return order.chain === 'base' ? findBasePayment(order) : findSolanaPayment(order);
}

// Idempotently provision a prepaid key for a paid order. Plaintext key is
// returned only the first time (we never store it).
export function provisionCryptoKey(
	order: CryptoOrder,
	signature: string
): { key?: string; prefix: string; created: boolean; expiresAt: number } {
	if (order.keyId) {
		const existing = db.select().from(apiKeys).where(eq(apiKeys.id, order.keyId)).get();
		return { prefix: existing?.keyPrefix ?? '', created: false, expiresAt: existing?.expiresAt ?? Date.now() };
	}
	const days = order.months >= 12 ? 365 : order.months * 30;
	const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
	const { record, key } = createApiKey({
		tier: order.tier as TierId,
		label: `crypto-${order.chain}-${order.months}mo`,
		mode: 'live',
		expiresAt
	});
	db.update(cryptoOrders)
		.set({ status: 'paid', keyId: record.id, signature, paidAt: Date.now() })
		.where(eq(cryptoOrders.id, order.id))
		.run();
	return { key, prefix: record.keyPrefix, created: true, expiresAt };
}

export function expireIfStale(order: CryptoOrder): CryptoOrder {
	if (order.status === 'pending' && Date.now() > order.expiresAt) {
		db.update(cryptoOrders).set({ status: 'expired' }).where(eq(cryptoOrders.id, order.id)).run();
		return { ...order, status: 'expired' };
	}
	return order;
}

export function monthsForPeriod(periodId: string): number | null {
	return cryptoPeriod(periodId)?.months ?? null;
}
