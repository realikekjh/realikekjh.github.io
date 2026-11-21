/* 中转（Cloudflare Worker）
 * 作用：给上游模型接口套一层自己的域名，并补上跨域响应头，
 * 这样纯静态站点才能直接调用它。
 *
 * 部署（免费，2 分钟）：
 *   1) 打开 https://dash.cloudflare.com/ → Workers & Pages → Create → Worker
 *   2) 把本文件内容整段贴进编辑器（覆盖默认代码）→ Deploy
 *   3) 拿到地址，例如 https://ds-relay.<你的子域>.workers.dev
 *   4) 回到站点，点左下角齿轮：URL 填 该地址 + /v1，Key 填上游的 Key，模型自己选
 *
 * 想换上游：在 Worker 的 Settings → Variables 里加 UPSTREAM（例如 https://api.openai.com）。
 * 想限制谁能用：把 CORS_ORIGIN 改成你的站点域名，例如 https://realikekjh.github.io
 */

const UPSTREAM = 'https://api.agnes-ai.cn';
const CORS_ORIGIN = '*';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function unescapeHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
}

// Bing 的 RSS 输出：不需要 Key，也不是 HTML 抓取，最稳的一条偏路子
async function bingRss(q, limit) {
  const res = await fetch('https://www.bing.com/search?format=rss&count=' + limit + '&q=' + encodeURIComponent(q), {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' }
  });
  const xml = await res.text();
  const out = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) && out.length < limit) {
    const b = m[1];
    const title = unescapeHtml((b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1]);
    const link = ((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim();
    const desc = unescapeHtml((b.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1]);
    if (title && link) out.push({ title, url: link, snippet: desc });
  }
  return out;
}

async function ddgHtml(q, limit) {
  const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), {
    headers: { 'User-Agent': UA }
  });
  const html = await res.text();
  const out = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    let url = m[1];
    try {
      const u = new URL(url, 'https://duckduckgo.com');
      if (u.searchParams.get('uddg')) url = u.searchParams.get('uddg');
    } catch (e) { /* 原样 */ }
    const title = unescapeHtml(m[2]);
    if (title) out.push({ title, url, snippet: '' });
  }
  const snips = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map((x) => unescapeHtml(x[1]));
  snips.forEach((s, i) => { if (i < out.length) out[i].snippet = s; });
  return out;
}

async function searchAll(q) {
  if (!q) return [];
  let results = [];
  try { results = await bingRss(q, 5); } catch (e) { results = []; }
  if (!results.length) {
    try { results = await ddgHtml(q, 5); } catch (e) { results = []; }
  }
  return results;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 搜索入口：Worker 有自己的出口，能抓国内打不通的搜索页。
    // 主用 Bing 的 RSS（免 Key、返回干净 XML），失败再抓 DuckDuckGo HTML。
    if (url.pathname === '/search') {
      const q = url.searchParams.get('q') || '';
      const results = await searchAll(q);
      return new Response(JSON.stringify({ results }), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': (env && env.CORS_ORIGIN) || CORS_ORIGIN
        }
      });
    }

    const upstream = ((env && env.UPSTREAM) || UPSTREAM).replace(/\/+$/, '');
    const allowOrigin = (env && env.CORS_ORIGIN) || CORS_ORIGIN;
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const u = new URL(request.url);
    const target = upstream + u.pathname + u.search;
    const headers = new Headers(request.headers);
    ['host', 'origin', 'referer', 'cf-connecting-ip', 'x-forwarded-for'].forEach((k) => headers.delete(k));

    const init = { method: request.method, headers, redirect: 'follow' };
    if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

    const res = await fetch(target, init);
    const out = new Headers(res.headers);
    Object.keys(cors).forEach((k) => out.set(k, cors[k]));
    out.delete('content-encoding');
    out.delete('content-length');
    return new Response(res.body, { status: res.status, headers: out });
  }
};
