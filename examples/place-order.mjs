// Place a limit order, then confirm what actually happened.
//
// Dry run by default. Nothing is sent without --live.
//   node examples/place-order.mjs --slug <market-slug> --outcome Yes --price 39 --shares 25
//   node examples/place-order.mjs ... --live
import { smartx } from './client.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const LIVE = process.argv.includes('--live');
const MAX_USD = Number(arg('max', 150));   // a typo in --shares should not be able to spend the account

const fail = msg => { console.error(msg); process.exitCode = 1; };

async function main() {
  const slug = arg('slug');
  const outcomeName = arg('outcome', 'Yes');
  const cents = Number(arg('price'));
  const shares = Number(arg('shares'));

  if (!slug || !cents || !shares) return fail('need --slug, --price (1-99), --shares');
  if (!Number.isInteger(cents) || cents < 1 || cents > 99) {
    return fail('--price must be a whole number of cents, 1 to 99');
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

  // budget has to cover fees as well as the shares, so leave headroom
  const notional = (cents / 100) * shares;
  const budget = Number((notional * 1.05).toFixed(2));

  if (budget > MAX_USD) {
    return fail(`budget ${budget} exceeds the ${MAX_USD} cap. Raise it with --max if you mean it.`);
  }

  console.log(`${market.question || slug}`);
  console.log(`  BUY ${shares} sh of "${outcome.outcome_text}" at ${cents}c`);
  console.log(`  notional ${notional.toFixed(2)}  budget ${budget.toFixed(2)} (fee headroom included)`);

  if (!LIVE) {
    console.log('\ndry run. add --live to send.');
    return;
  }

  const placed = await api.placeOrder({
    tokenId: outcome.token_id,
    side: 'BUY',
    centsPrice: cents,
    shareAmount: shares,
    usdcBudget: budget
  });
  console.log(`\naccepted: order_id ${placed.order_id} status ${placed.order_status}`);

  // 2. accepted is not filled. Confirm on the order record.
  console.log('confirming...');
  await new Promise(r => setTimeout(r, 3000));

  const { list } = await api.orders({});
  const mine = list.find(o => o.order_id === placed.order_id);
  if (!mine) {
    console.log('order not in the list yet; poll again shortly');
    return;
  }
  console.log(`  status ${mine.order_status} / ${mine.exchange_status}`);
  console.log(`  filled ${mine.filled_share} of ${mine.share_amount} shares for ${mine.filled_usdc} USDC`);
  if (mine.error_msg) console.log(`  error: ${mine.error_msg}`);
}

main().catch(err => fail(String(err.message || err)));
