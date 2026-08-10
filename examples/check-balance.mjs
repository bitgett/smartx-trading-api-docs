// How much can I actually spend right now?
//
// There is no balance endpoint, so this measures it: an oversized limit order
// far from the book comes back trimmed to exactly your free balance. The order
// cannot fill at that price and is cancelled immediately.
//
//   SMARTX_TOKEN="jwt eyJ..." node examples/check-balance.mjs
//   node examples/check-balance.mjs --slug <some-live-market>
import { smartx } from './client.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const SLUG = arg('slug', 'will-bitcoin-dip-to-60k-in-august-2026');

const api = smartx();

const { market } = await api.market(SLUG);
if (market.is_close) {
  console.error(`${SLUG} has closed; pass --slug for a market that is still trading`);
  process.exitCode = 1;
} else {
  const outcome = market.outcomes[0];
  console.log(`probing with ${market.question}`);
  console.log(`  1c limit on "${outcome.outcome_text}", far below the book, cancelled straight after\n`);

  const { balance, note, probes, exact } = await api.freeBalance({ tokenId: outcome.token_id, cents: 1 });

  if (balance == null) {
    console.log(`could not measure: ${note}`);
  } else {
    console.log(`free balance: ${balance} USDC${exact ? "" : " (approximate: " + note + ")"}   [${probes} probes]`);
    // what that buys, so the number is useful rather than trivia
    console.log('\nat these prices that is:');
    for (const c of [5, 10, 25, 50, 75]) {
      const shares = balance / (c / 100);
      console.log(`  ${String(c).padStart(2)}c   ${shares.toFixed(2).padStart(10)} shares` +
        (shares < 5 ? '   below the 5 share minimum' : ''));
    }
  }
}
