// Your open and resolved positions.
//   SMARTX_TOKEN="jwt eyJ..." node examples/list-positions.mjs
import { smartx } from './client.mjs';

const api = smartx();
const { list, total } = await api.positions({ size: 100 });

console.log(`${total} position${total === 1 ? '' : 's'}\n`);

for (const p of list) {
  const pnl = (p.total_pnl ?? 0).toFixed(2);
  const sign = p.total_pnl > 0 ? '+' : '';
  console.log(`${p.outcome.padEnd(4)} ${String(p.shares.toFixed(1)).padStart(9)} sh  ` +
    `entry ${String(p.avg_entry_cents.toFixed(1)).padStart(5)}c  ` +
    `mark ${String(p.mark_cents).padStart(3)}c  ` +
    `pnl ${(sign + pnl).padStart(10)}  ` +
    `${p.market_status}`);
  console.log(`     ${p.market_title}`);
  // redeemable means claimable, not yet in your balance
  if (p.redeemable) console.log(`     -> ${p.action}`);
  console.log();
}

const net = list.reduce((s, p) => s + (p.total_pnl ?? 0), 0);
console.log(`net ${net >= 0 ? '+' : ''}${net.toFixed(2)} USDC`);
