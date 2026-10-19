import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserType } from '../apps/server/node_modules/playwright-core/index.js';
import { FreelancerBrowserPage } from '../apps/server/src/lib/browser-bid-page.js';
import { connectExistingChrome } from '../apps/server/src/services/browser-bidding.js';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { chromium } = require('playwright-core') as { chromium: BrowserType };
const input = { operation: 'submit_bid' as const, projectId: 71, amount: 100, period: 14, milestonePercentage: 100, description: 'DATA UJI — proposal tanpa pengiriman eksternal' };
const identity = { id: '42', username: 'owner-fixture' };
let remaining = 3; let tamper = false; let missingId = false; let requests = 0; let upgrade = false;
const header = '<button aria-label="Menu">@owner-fixture</button>';
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.url === '/dashboard') return res.end(`${header}<main><p>${remaining} penawaran tersisa dari 100</p></main>`);
  if (req.url === '/projects/71') return res.end(`${header}<main><h1>DATA UJI — Project ID: 71 · USD</h1><form><input name="amount"/><input name="period"/><textarea name="description"></textarea><input name="milestonePercentage"/><label><input type="checkbox" ${upgrade ? 'checked' : ''}/>Upgrade berbayar (fixture)</label><button type="submit">Place Bid</button></form></main><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await fetch('/api/projects/0.1/bids/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:71,bidder_id:42,amount:Number(f.get('amount'))+${tamper ? 1 : 0},period:Number(f.get('period')),milestone_percentage:Number(f.get('milestonePercentage')),description:f.get('description')})});};</script>`);
  if (req.url === '/api/projects/0.1/bids/' && req.method === 'POST') {
    requests++; const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
    res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ status: 'success', result: { ...body, ...(missingId ? {} : { id: 9123 }) } }));
  }
  res.statusCode = 404; res.end('Not found');
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture server unavailable');
const origin = `http://127.0.0.1:${address.port}`;
const directory = await mkdtemp(join(tmpdir(), 'fvh-browser-fixture-'));
const context = await chromium.launchPersistentContext(directory, { channel: 'chrome', headless: true, args: ['--remote-debugging-port=0'] });
try {
  // This owned test browser has no access to the owner's profile or Freelancer session.
  const ownerTab = context.pages()[0]!;
  await ownerTab.goto(`${origin}/dashboard`);
  const port = Number((await readFile(join(directory, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
  assert.ok(Number.isInteger(port) && port > 0);
  const connection = await connectExistingChrome(() => chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true }));
  const page = connection.page;
  const driver = new FreelancerBrowserPage(page, origin, 1500);
  assert.equal((await driver.inspect()).remaining, 3);
  assert.equal((await driver.submit(input, identity, async () => undefined)).resultId, '9123'); assert.equal(requests, 1);
  await assert.rejects(driver.submit(input, identity, async () => { throw new Error('Paused'); })); assert.equal(requests, 1);
  remaining = 0; await assert.rejects(driver.submit(input, identity, async () => undefined)); assert.equal(requests, 1);
  remaining = 3; upgrade = true; await assert.rejects(driver.submit(input, identity, async () => undefined)); assert.equal(requests, 1);
  upgrade = false; tamper = true; await assert.rejects(driver.submit(input, identity, async () => undefined)); assert.equal(requests, 1);
  tamper = false;
  let guards = 0;
  await assert.rejects(driver.submit(input, identity, async () => { if (++guards === 2) await new Promise(resolve => setTimeout(resolve, 2200)); }));
  await new Promise(resolve => setTimeout(resolve, 2300)); assert.equal(requests, 1);
  tamper = false; missingId = true; await assert.rejects(driver.submit(input, identity, async () => undefined)); assert.equal(requests, 2);
  await connection.disconnect();
  assert.equal(ownerTab.isClosed(), false); assert.equal(context.pages().length, 1);
  assert.equal((await new FreelancerBrowserPage(ownerTab, origin).inspect()).username, identity.username);
  console.log('PASS: Chrome fixture — confirmed ID, policy pause, zero quota, upgrade, changed request, late authorization, missing ID, CDP disconnect preserves existing tab. All requests stayed on localhost.');
} finally { await context.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
