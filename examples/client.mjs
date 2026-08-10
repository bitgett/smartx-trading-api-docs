// Minimal SmartX client. No dependencies.
//
// The two things worth copying: origin/referer are required or the edge returns
// 403 before the API sees you, and `code` in the body is the real status.
const BASE = 'https://api-grey.smartx.io';

export function smartx(token = process.env.SMARTX_TOKEN) {
  if (!token) throw new Error('set SMARTX_TOKEN, see docs/authentication.md');

  // The scheme is `jwt`, not `Bearer`. Sending Bearer returns code 401.
  const headers = {
    authorization: /^jwt /i.test(token) ? token : `jwt ${token}`,
    'content-type': 'application/json; charset=utf-8',
    origin: 'https://app.smartx.io',
    referer: 'https://app.smartx.io/',
    accept: '*/*'
  };

  async function call(path, init = {}) {
    const res = await fetch(`${BASE}${path}`, { ...init, headers });
    const text = await res.text();
    if (res.status === 403) {
      throw new Error('403 — token expired, or origin/referer missing. See docs/errors.md');
    }
    let body;
    try { body = JSON.parse(text); } catch { throw new Error(`${res.status} non-JSON: ${text.slice(0, 120)}`); }
    // The two families disagree on what success looks like: /service returns
    // code 200, /analytics returns code 0. Accept both or half the API looks broken.
    if (body.code !== 200 && body.code !== 0) throw new Error(`code ${body.code}: ${body.msg}`);
    return body.data;
  }

  const get = path => call(path);
  const post = (path, payload) => call(path, { method: 'POST', body: JSON.stringify(payload) });

  return {
    positions: ({ page = 1, size = 100 } = {}) =>
      get(`/service/poly_trade/positions?page_num=${page}&page_size=${size}`),

    orders: ({ status = '', conditionId = '' } = {}) => {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      if (conditionId) q.set('condition_id', conditionId);
      return get(`/service/poly_trade/orders?${q}`);
    },

    marketPosition: conditionId =>
      get(`/service/poly_trade/market_position?condition_id=${conditionId}`),

    market: slug =>
      get(`/analytics/api/v1/markets/slug?slug=${encodeURIComponent(slug)}`),

    // usdcBudget is what decides your size; shareAmount is sent because the API
    // wants the field, and comes back overwritten. tokenId stays a string end to
    // end, it does not survive a JS number.
    placeOrder: ({ tokenId, side, centsPrice, usdcBudget, shareAmount = 5, orderType = 'LIMIT' }) =>
      post('/service/poly_trade/v2/new_order', {
        order_type: orderType,
        token_id: String(tokenId),
        side,
        cents_price: centsPrice,
        share_amount: shareAmount,
        usdc_budget: usdcBudget
      }),

    // Unversioned on purpose. v2/cancel_order cancels correctly but answers
    // 50000 when it worked and 200 when there was nothing to cancel, so its
    // status code is worse than useless.
    cancelOrder: orderId =>
      post('/service/poly_trade/cancel_order', { order_id: String(orderId) }),

    async cancelAndVerify(orderId) {
      await this.cancelOrder(orderId).catch(() => null);
      await new Promise(r => setTimeout(r, 1500));
      const { list } = await this.orders({});
      const row = list.find(o => o.order_id === String(orderId));
      const gone = !row || /cancel/i.test(row.order_status || '');
      return { cancelled: gone, status: row?.order_status ?? 'not in list' };
    },

    // Place, then report what was actually placed rather than what was asked
    // for. Two things differ: usdc_budget decides the size, and a budget over
    // your free balance is trimmed without saying so. Use this anywhere the
    // real size matters, which is anywhere you hedge or size the next order.
    async placeOrderVerified(params, { waitMs = 3000 } = {}) {
      const placed = await this.placeOrder(params);
      await new Promise(r => setTimeout(r, waitMs));
      const { list } = await this.orders({});
      const row = list.find(o => o.order_id === placed.order_id);
      if (!row) return { orderId: placed.order_id, pending: true, requested: params.usdcBudget };
      const spent = Number(row.usdc_budget);
      return {
        orderId: placed.order_id,
        status: row.order_status,
        exchangeStatus: row.exchange_status,
        shares: Number(row.share_amount),
        spent,
        filledShares: Number(row.filled_share),
        filledUsdc: Number(row.filled_usdc),
        requested: params.usdcBudget,
        trimmed: Math.abs(spent - params.usdcBudget) > 1e-9,
        error: row.error_msg || null
      };
    },

    // There is no balance endpoint, so this measures it.
    //
    // A budget a little over your free balance comes back trimmed to exactly
    // what you have. A budget well over is rejected outright with 60300. So a
    // single oversized probe does not work: it has to close in on the number
    // until it lands inside the trimming band, which reports the balance exactly.
    //
    // Each step places a limit far below the book, which cannot fill, and
    // cancels it. Costs nothing but does touch the order book, so cache the
    // answer rather than calling this in a loop.
    async freeBalance({ tokenId, cents = 1, ceiling = 10000, maxProbes = 14 } = {}) {
      if (!tokenId) throw new Error('freeBalance needs a tokenId from a live market');

      const probe = async budget => {
        let placed;
        try {
          placed = await this.placeOrder({ tokenId, side: 'BUY', centsPrice: cents, usdcBudget: budget });
        } catch (err) {
          if (/60300/.test(err.message)) return { rejected: true };
          if (/60307/.test(err.message)) return { tooSmall: true };
          throw err;
        }
        await new Promise(r => setTimeout(r, 2200));
        const { list } = await this.orders({});
        const row = list.find(o => o.order_id === placed.order_id);
        await this.cancelAndVerify(placed.order_id).catch(() => null);
        const spent = row ? Number(row.usdc_budget) : null;
        return { accepted: true, spent, trimmed: spent != null && Math.abs(spent - budget) > 1e-9 };
      };

      let lo = 0, hi = ceiling, probes = 0, best = null;
      while (probes < maxProbes && hi - lo > 1e-4) {
        const mid = lo === 0 ? hi / 2 : (lo + hi) / 2;
        const r = await probe(Number(mid.toFixed(6)));
        probes++;
        if (r.tooSmall) break;                      // below the 5 share floor, cannot narrow further
        if (r.rejected) { hi = mid; continue; }     // balance is under mid
        if (r.trimmed) return { balance: r.spent, probes, exact: true };
        lo = mid; best = r.spent;                   // accepted in full, balance is at least this
      }
      return { balance: best, probes, exact: false, note: best == null ? 'could not measure' : `at least ${best}` };
    }
  };
}
