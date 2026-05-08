// One-shot probe for LinkedIn voyager API. Reads cookies from a Patchright
// persistent profile, constructs the Cookie + csrf-token headers, and calls
// /voyager/api/identity/profiles/<publicId>/profileView. Run via docker exec
// inside the running mcp-server container so node_modules resolves.
import { chromium } from 'patchright';

const PROFILE_DIR = process.argv[2] || '/tmp/sb2-copy';
const PUBLIC_ID = process.argv[3] || 'williamhgates';

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: null,
});
const cookies = await ctx.cookies('https://www.linkedin.com');
await ctx.close();

const cookieMap = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const jsessionRaw = cookieMap['JSESSIONID'] || '';
const csrf = jsessionRaw.replace(/^"|"$/g, '');

console.log('JSESSIONID:', jsessionRaw);
console.log('csrf:', csrf);
console.log('total cookies:', cookies.length);

const url = `https://www.linkedin.com/voyager/api/identity/profiles/${PUBLIC_ID}/profileView`;
const headers = {
  cookie: cookieString,
  'csrf-token': csrf,
  accept: 'application/vnd.linkedin.normalized+json+2.1',
  'x-restli-protocol-version': '2.0.0',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'x-li-lang': 'pt_BR',
};

const res = await fetch(url, { headers });
console.log('status:', res.status);
console.log('content-type:', res.headers.get('content-type'));
const body = await res.text();
console.log('body length:', body.length);
console.log('body head:', body.slice(0, 1500));
process.exit(0);
