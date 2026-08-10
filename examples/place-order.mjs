// Place a limit order, then confirm what actually happened.
//
// You size by SPEND, not by share count, because that is what the API honours.
// Dry run by default. Nothing is sent without --live.
//   node examples/place-order.mjs --slug <market-slug> --outcome Yes --price 39 --spend 25
//   node examples/place-order.mjs ... --live
import { smartx } from './client.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const LIVE = process.argv.includes('--live');
const MAX_USD = Number(arg('max', 150));   // a typo in --spend should not be able to drain the account

const fail = msg => { console.error(msg); process.exitCode = 1; };

async function main() {
  const slug = arg('slug');
  const outcomeName = arg('outcome', 'Yes');
  const cents = Number(arg('price'));
  const spend = Number(arg('spend'));

  if (!slug || !cents || !spend) return fail('need --slug, --price (1-99), --spend (USDC)');
  if (!Number.isInteger(cents) || cents < 1 || cents > 99) {
    return fail('--price must be a whole number of cents, 1 to 99');
  }
  // the minimum is checked against the derived size, not the share_amount sent
  const expected = spend / (cents / 100);
  if (expected < 5) {
    return fail(`--spend ${spend} at ${cents}c works out to ${expected.toFixed(2)} shares; ` +
      `the minimum is 5, so spend at least ${(5 * cents / 100).toFixed(2)}`);
  }

  const api = smartx();

  // 1. resolve the outcome to a token_id. The market sits under data.market and
  //    the label field is outcome_text.
  const { market } = await api.market(slug);
  const outcomes = market.outcomes || [];
  const outcome = outcomes.find(o => String(o.outcome_text).toLowerCase() === outcomeName.toLowerCase());
  if (!outcome) {
    return fail(`no outcome "${outcomeName}". available: ${outcomes.map(o => o.outcome_text).join(', ')}`);
  }

  if (spend > MAX_USD) {
    return fail(`spend ${spend} exceeds the ${MAX_USD} cap. Raise it with --max if you mean it.`);
  }

  console.log(`${market.question || slug}`);
  console.log(`  BUY "${outcome.outcome_text}" at ${cents}c, spending ${spend.toFixed(2)} USDC`);
  console.log(`  that is about ${expected.toFixed(4)} shares, if your balance covers it`);

  if (!LIVE) {
    console.log('\ndry run. add --live to send.');
    return;
  }

  const placed = await api.placeOrder({
    tokenId: outcome.token_id,
    side: 'BUY',
    centsPrice: cents,
    usdcBudget: spend
  });
  console.log(`\naccepted: order_id ${placed.order_id} status ${placed.order_status}`);

  // 2. Accepted is not filled, and the size you asked for is not the size you
  //    got. Both answers live on the order record, not in the response above.
  console.log('confirming...');
  await new Promise(r => setTimeout(r, 3000));

  const { list } = await api.orders({});
  const mine = list.find(o => o.order_id === placed.order_id);
  if (!mine) {
    console.log('order not in the list yet; poll again shortly');
    return;
  }
  console.log(`  status ${mine.order_status} / ${mine.exchange_status}`);
  console.log(`  placed ${mine.share_amount} shares for ${mine.usdc_budget} USDC`);
  if (Math.abs(Number(mine.usdc_budget) - spend) > 0.0001) {
    console.log(`  note: trimmed from ${spend} — your free balance capped it`);
  }
  console.log(`  filled ${mine.filled_share} of ${mine.share_amount} shares for ${mine.filled_usdc} USDC`);
  if (mine.error_msg) console.log(`  error: ${mine.error_msg}`);
}

main().catch(err => fail(String(err.message || err)));
