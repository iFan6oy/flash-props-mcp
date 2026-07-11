import { env } from '../env.js';
import { TIERS, type TierId } from './tiers.js';

export const USDC_DECIMALS = 6;

// Crypto checkout is live only when a receive wallet is configured.
export function cryptoEnabled(): boolean {
	return !!env.RECEIVE_WALLET && !!env.SOLANA_RPC_URL;
}

export const CRYPTO_PERIODS = [
	{ id: 'month', months: 1, days: 30, label: '1 month' },
	{ id: 'year', months: 12, days: 365, label: '1 year' }
] as const;
export type CryptoPeriodId = (typeof CRYPTO_PERIODS)[number]['id'];

export function cryptoPeriod(id: string) {
	return CRYPTO_PERIODS.find((p) => p.id === id) ?? null;
}

// Prepaid USDC price for a tier over N months, crypto discount applied (2dp).
// Free/enterprise are not crypto-purchasable (null).
export function cryptoPriceUsdc(tier: TierId, months: number): number | null {
	const t = TIERS[tier];
	if (t.priceMonthly === null || t.priceMonthly <= 0) return null;
	const net = t.priceMonthly * months * (1 - env.CRYPTO_DISCOUNT_PCT / 100);
	return Math.round(net * 100) / 100;
}

// Effective per-month USDC price after the crypto discount (for display).
export function cryptoPerMonthUsdc(tier: TierId): number | null {
	const t = TIERS[tier];
	if (t.priceMonthly === null || t.priceMonthly <= 0) return null;
	return Math.round(t.priceMonthly * (1 - env.CRYPTO_DISCOUNT_PCT / 100) * 100) / 100;
}

export function discountPct(): number {
	return env.CRYPTO_DISCOUNT_PCT;
}

// USDC (6dp) decimal amount → integer base units.
export function toBaseUnits(amountUsdc: number): bigint {
	return BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));
}
