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

    // tokenId stays a string end to end; it does not survive a JS number
    placeOrder: ({ tokenId, side, centsPrice, shareAmount, usdcBudget, orderType = 'LIMIT' }) =>
      post('/service/poly_trade/v2/new_order', {
        order_type: orderType,
        token_id: String(tokenId),
        side,
        cents_price: centsPrice,
        share_amount: shareAmount,
        usdc_budget: usdcBudget
      })
  };
}
