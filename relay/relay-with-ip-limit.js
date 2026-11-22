/* DeepSeek 静态站中转 + 按 IP 限流封禁（Cloudflare Worker）
 *
 * 它在前面挡一层，所以能做的事：
 *   1) 看到访客真实 IP（CF-Connecting-IP），按 IP 计数
 *   2) 每分钟/每天超量 → 429；连续犯规 → 封禁 N 天，期间直接 403
 *   3) 把上游 Key 藏在 Worker 里，前端拿不到（解决 F12 扒 Key）
 *   4) 可选：入口口令 TOKEN，没有它连模型都调不动
 *   5) 修好跨域头，前端直接把这个地址填进「模型网关」
 *
 * 部署（免费额度够用）：
 *   1) dash.cloudflare.com → Workers & Pages → Create Worker → 贴入本文件 → Deploy
 *   2) 建一个 KV：Storage & Databases → KV → Create namespace，名字随意（如 ds_rl）
 *   3) 回到 Worker → Settings → Bindings → 加 KV 绑定，变量名必须写 RL，选中刚建的 namespace
 *   4) Settings → Variables and Secrets 加：
 *        UPSTREAM  = https://api.agnes-ai.cn      （上游地址，不带 /v1）
 *        UPSTREAM_KEY = sk-xxxx                   （加密存储，选 Secret）
 *        TOKEN     = 你的口令（可留空=不校验）
 *        CORS_ORIGIN = https://realikekjh.github.io
 *      限流参数可选：PER_MIN=20、PER_DAY=300、BAN_DAYS=3、BAN_AFTER=3
 *   5) 部署完拿到 https://xxx.workers.dev，站点里 URL 填 https://xxx.workers.dev/v1，
 *      Key 处填你的 TOKEN（不是上游 Key）
 *
 * 注意：KV 有最终一致性（跨区域同步有秒级延迟），单人站点足够；
 *      要强一致就换 Durable Objects，代码结构一样，只是把 get/put 换成 stub.fetch。
 */

const DEFAULT_UPSTREAM = 'https://api.agnes-ai.cn';
const DEFAULT_ORIGIN = 'https://realikekjh.github.io';

const PER_MIN = 20;      // 每分钟每 IP 最多几次
const PER_DAY = 300;     // 每天每 IP 最多几次
const BAN_AFTER = 3;     // 一分钟内被拦几次算“爆破”，直接封
const BAN_DAYS = 3;      // 封几天

function corsHeaders(env, req) {
  const allow = env.CORS_ORIGIN || DEFAULT_ORIGIN;
  const origin = req.headers.get('Origin') || '';
  const ok = origin === allow || allow === '*' ? (allow === '*' ? '*' : origin) : allow;
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Local-Token,X-Local-Api-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extra || {})
  });
}

function ymd() { return new Date().toISOString().slice(0, 10); }
function minKey() { return new Date().toISOString().slice(0, 16); } // 到分钟

async function getNum(env, k) {
  const v = await env.RL.get(k);
  return v ? parseInt(v, 10) || 0 : 0;
}

// 返回 null 表示放行；否则返回 { status, body }
async function rateCheck(env, ip) {
  const ban = await env.RL.get('ban:' + ip);
  if (ban) {
    const left = Math.max(0, Math.round((Number(ban) - Date.now()) / 86400000 * 10) / 10);
    return { status: 403, body: { error: { message: '你被暂时限制了，还有 ' + left + ' 天解封。', type: 'ip_banned' } } };
  }
  const mk = 'm:' + ip + ':' + minKey();
  const dk = 'd:' + ip + ':' + ymd();
  const mk2 = 'f:' + ip + ':' + minKey(); // 犯规计数

  const m = await getNum(env, mk);
  const d = await getNum(env, dk);

  if (m >= PER_MIN || d >= PER_DAY) {
    const f = await getNum(env, mk2) + 1;
    await env.RL.put(mk2, String(f), { expirationTtl: 120 });
    if (f >= BAN_AFTER) {
      const until = Date.now() + BAN_DAYS * 86400000;
      await env.RL.put('ban:' + ip, String(until), { expirationTtl: BAN_DAYS * 86400 + 60 });
      return { status: 403, body: { error: { message: '请求过于频繁，已限制该 IP ' + BAN_DAYS + ' 天。', type: 'ip_banned_now' } } };
    }
    return {
      status: 429,
      body: { error: { message: '慢点，一分钟最多 ' + PER_MIN + ' 次、一天 ' + PER_DAY + ' 次。再超 ' + (BAN_AFTER - f) + ' 次要封 ' + BAN_DAYS + ' 天。', type: 'rate_limited' } }
    };
  }

  // 先记数再放行，并发也不会漏太多
  await env.RL.put(mk, String(m + 1), { expirationTtl: 120 });
  await env.RL.put(dk, String(d + 1), { expirationTtl: 90000 });
  return null;
}

async function handleChat(req, env) {
  const url = new URL(req.url);
  const upstream = (env.UPSTREAM || DEFAULT_UPSTREAM).replace(/\/+$/, '');
  const onlyPath = url.pathname.replace(/^\/v1/, '');
  const target = upstream + '/v1' + onlyPath + (url.search || '');

  let body = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.text();
  }

  const headers = {
    'Content-Type': req.headers.get('Content-Type') || 'application/json',
    'Accept': req.headers.get('Accept') || 'text/event-stream',
    'Authorization': 'Bearer ' + (env.UPSTREAM_KEY || '')
  };

  const res = await fetch(target, { method: req.method, headers: headers, body: body });
  const out = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(env, req))) out.set(k, v);
  return new Response(res.body, { status: res.status, headers: out });
}

export default {
  async fetch(req, env, ctx) {
    const cors = corsHeaders(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const ip = req.headers.get('CF-Connecting-IP') || '0.0.0.0';
    const url = new URL(req.url);

    // 健康检查不计数
    if (url.pathname === '/ping') return json({ ok: true, ip_masked: ip.slice(0, 4) + '***' }, 200, cors);

    // 口令门禁（TOKEN 没配就跳过）
    if (env.TOKEN) {
      const got = req.headers.get('X-Local-Token') || req.headers.get('X-Local-Api-Key') ||
        (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (got !== env.TOKEN) return json({ error: { message: '口令不对。', type: 'bad_token' } }, 401, cors);
    }

    const blocked = await rateCheck(env, ip);
    if (blocked) return json(blocked.body, blocked.status, cors);

    try {
      return await handleChat(req, env);
    } catch (e) {
      return json({ error: { message: '中转出错：' + (e && e.message ? e.message : String(e)) } }, 502, cors);
    }
  }
};
