import { env } from '../env.js';
import { TIERS, type TierId } from './tiers.js';

export const USDC_DECIMALS = 6;

export type CryptoChain = 'solana' | 'base';

export function solanaEnabled(): boolean {
	return !!env.RECEIVE_WALLET && !!env.SOLANA_RPC_URL;
}
export function baseEnabled(): boolean {
	return !!env.EVM_RECEIVE_WALLET && !!env.BASE_RPC_URL;
}
export function cryptoEnabled(): boolean {
	return solanaEnabled() || baseEnabled();
}
export function enabledChains(): CryptoChain[] {
	const out: CryptoChain[] = [];
	if (solanaEnabled()) out.push('solana');
	if (baseEnabled()) out.push('base');
	return out;
}
export function defaultChain(): CryptoChain | null {
	return enabledChains()[0] ?? null;
}
export function chainEnabled(chain: string): chain is CryptoChain {
	return (chain === 'solana' && solanaEnabled()) || (chain === 'base' && baseEnabled());
}

export const CHAIN_LABEL: Record<CryptoChain, string> = { solana: 'Solana', base: 'Base' };

export const CRYPTO_PERIODS = [
	{ id: 'month', months: 1, days: 30, label: '1 month' },
	{ id: 'year', months: 12, days: 365, label: '1 year' }
] as const;
export type CryptoPeriodId = (typeof CRYPTO_PERIODS)[number]['id'];

export function cryptoPeriod(id: string) {
	return CRYPTO_PERIODS.find((p) => p.id === id) ?? null;
}

// Prepaid USDC price for a tier over N months, crypto discount applied (2dp).
export function cryptoPriceUsdc(tier: TierId, months: number): number | null {
	const t = TIERS[tier];
	if (t.priceMonthly === null || t.priceMonthly <= 0) return null;
	const net = t.priceMonthly * months * (1 - env.CRYPTO_DISCOUNT_PCT / 100);
	return Math.round(net * 100) / 100;
}

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
