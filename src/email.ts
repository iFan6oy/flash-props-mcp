// Email delivery via Resend. Sends the API key to the buyer on creation so a
// closed browser tab never loses the key. Degrades gracefully: with no
// RESEND_API_KEY set, every call is a no-op (page reveal remains the fallback),
// and a send failure is logged, never thrown into the request path.
import { Resend } from 'resend';
import { env } from './env.js';

let _resend: Resend | null = null;
function client(): Resend | null {
	if (!env.RESEND_API_KEY) return null;
	if (!_resend) _resend = new Resend(env.RESEND_API_KEY);
	return _resend;
}

export function emailEnabled(): boolean {
	return !!env.RESEND_API_KEY;
}

interface KeyEmailOpts {
	to: string;
	key: string;
	tier: string;
	paid: boolean;
}

function keyEmailBody(o: KeyEmailOpts): { html: string; text: string } {
	const base = env.PUBLIC_BASE_URL;
	const curl = `curl -H "Authorization: Bearer ${o.key}" \\\n  "${base}/api/v1/props?limit=10"`;
	const tierName = o.tier.charAt(0).toUpperCase() + o.tier.slice(1);
	const manage = o.paid ? `Manage billing: ${base}/billing/portal` : `Upgrade any time: ${base}/#pricing`;

	const text = [
		`Your Flash Props API key (${tierName} tier)`,
		'',
		o.key,
		'',
		'Keep this secret. It is shown once and grants access under your account.',
		'',
		'Quick start:',
		curl,
		'',
		`Docs:      ${base}/docs`,
		`Dashboard: ${base}/dashboard`,
		manage,
		'',
		'Flash Props API. Informational use only. Not affiliated with any league, team, or sportsbook. 21+.'
	].join('\n');

	const manageLink = o.paid
		? `<a href="${base}/billing/portal" style="color:#f58426">Manage billing</a>`
		: `<a href="${base}/#pricing" style="color:#f58426">Upgrade</a>`;

	const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#11151d">
  <div style="font-weight:800;font-size:16px;letter-spacing:-.01em;margin:0 0 18px;color:#0b0d12">⚡ Flash Props <span style="color:#9aa3b6;font-weight:600;font-size:13px">API</span></div>
  <h2 style="margin:0 0 2px">Your Flash Props API key</h2>
  <p style="color:#5b667a;margin:0 0 16px">${tierName} tier</p>
  <p style="margin:0 0 6px">Here's your key. Keep it secret — it grants access under your account.</p>
  <pre style="background:#0b0d12;color:#ff9d47;padding:12px 14px;border-radius:10px;overflow-x:auto;font-size:13px">${o.key}</pre>
  <p style="margin:16px 0 6px"><b>Quick start</b></p>
  <pre style="background:#0b0d12;color:#d7deee;padding:12px 14px;border-radius:10px;overflow-x:auto;font-size:12px">${curl
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')}</pre>
  <p style="margin:16px 0 0">
    <a href="${base}/docs" style="color:#f58426">Docs</a> &middot;
    <a href="${base}/dashboard" style="color:#f58426">Dashboard</a> &middot;
    ${manageLink}
  </p>
  <p style="color:#8a93a6;font-size:12px;margin:18px 0 0">Flash Props API. Informational use only. Not affiliated with any league, team, or sportsbook. 21+.</p>
</div>`;
	return { html, text };
}

// Fire-and-forget key delivery. Returns true on a confirmed send. Never throws.
export async function sendKeyEmail(o: KeyEmailOpts): Promise<boolean> {
	const r = client();
	if (!r || !o.to || !o.key) return false;
	try {
		const subject = o.paid ? `Your Flash Props ${o.tier} API key` : 'Your Flash Props API key';
		const { html, text } = keyEmailBody(o);
		const res = await r.emails.send({
			from: env.RESEND_FROM,
			to: o.to,
			subject,
			html,
			text
		});
		if (res.error) {
			console.warn('[email] send failed:', res.error.message);
			return false;
		}
		console.log(`[email] key delivered to ${o.to} (${o.tier})`);
		return true;
	} catch (e) {
		console.warn('[email] send threw:', e instanceof Error ? e.message : String(e));
		return false;
	}
}

// Emails a sign-in magic link for the customer dashboard. Same graceful
// degradation as sendKeyEmail (no-op without RESEND_API_KEY, never throws).
export async function sendMagicLink(to: string, link: string): Promise<boolean> {
	const r = client();
	if (!r || !to || !link) return false;
	try {
		const base = env.PUBLIC_BASE_URL;
		const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#11151d">
  <div style="font-weight:800;font-size:16px;letter-spacing:-.01em;margin:0 0 18px;color:#0b0d12">⚡ Flash Props <span style="color:#9aa3b6;font-weight:600;font-size:13px">API</span></div>
  <h2 style="margin:0 0 6px">Sign in to Flash Props</h2>
  <p style="margin:0 0 16px">Click below to open your dashboard. This link expires in 30 minutes.</p>
  <p style="margin:0 0 18px"><a href="${link}" style="display:inline-block;background:#f58426;color:#1a1206;font-weight:700;text-decoration:none;padding:11px 18px;border-radius:10px">Open my dashboard</a></p>
  <p style="color:#5b667a;font-size:13px;margin:0;word-break:break-all">Or paste this link: ${link}</p>
  <p style="color:#8a93a6;font-size:12px;margin:18px 0 0">Didn't request this? You can ignore this email. Flash Props API · ${base}</p>
</div>`;
		const text = `Sign in to Flash Props\n\nOpen your dashboard (expires in 30 min):\n${link}\n\nDidn't request this? Ignore this email.`;
		const res = await r.emails.send({ from: env.RESEND_FROM, to, subject: 'Sign in to Flash Props', html, text });
		if (res.error) {
			console.warn('[email] magic-link failed:', res.error.message);
			return false;
		}
		console.log(`[email] magic link sent to ${to}`);
		return true;
	} catch (e) {
		console.warn('[email] magic-link threw:', e instanceof Error ? e.message : String(e));
		return false;
	}
}
