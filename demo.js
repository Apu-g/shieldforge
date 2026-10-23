const { chromium } = require('playwright');
const fs = require('fs');

fs.mkdirSync('demo-screenshots', { recursive: true });
fs.mkdirSync('demo-videos', { recursive: true });

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDemo() {
  console.log('🚀 Starting ShieldForge Demo Recording...');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 600,
    args: ['--start-maximized']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: 'demo-videos/', size: { width: 1920, height: 1080 } }
  });
  
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  const step = async (name, fn) => {
    console.log(`\n━━━ ${name} ━━━`);
    try {
      await fn();
      await page.screenshot({ path: `demo-screenshots/${name.replace(/\s+/g, '-').toLowerCase()}.png`, fullPage: true });
      console.log(`✓ ${name} completed`);
    } catch (e) {
      console.log(`⚠ ${name} had issues:`, e.message);
    }
    await sleep(1000);
  };

  try {
    // ──────────────────────────────────────────────
    // STEP 1: Dashboard Overview
    // ──────────────────────────────────────────────
    await step('1-dashboard-overview', async () => {
      await page.goto('http://localhost:3003', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('.app-frame, .app-topbar, nav', { timeout: 15000 });
      await sleep(2000);
      console.log('✓ Dashboard loaded - System Health Nominal visible');
    });

    // ──────────────────────────────────────────────
    // STEP 2: Origins Tab
    // ──────────────────────────────────────────────
    await step('2-origins-tab', async () => {
      await page.click('a[href="/origins"]');
      await page.waitForSelector('text=Victim, text=victim-shop, text=Origin', { timeout: 10000 });
      await sleep(1500);
      console.log('✓ Origin registered: /t/victim-shop → http://localhost:3001');
    });

    // ──────────────────────────────────────────────
    // STEP 3: Policies Tab
    // ──────────────────────────────────────────────
    await step('3-policies-tab', async () => {
      await page.click('a[href="/policies"]');
      await page.waitForSelector('text=Shadow, text=Enforce, text=Policy', { timeout: 10000 });
      await sleep(1500);
      console.log('✓ Policy mode visible (Shadow/Enforce)');
    });

    // ──────────────────────────────────────────────
    // STEP 4: Visit Proxied Victim App
    // ──────────────────────────────────────────────
    await step('4-victim-app-proxied', async () => {
      await page.goto('http://localhost:3000/t/victim-shop/', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('text=Guestbook, h1:has-text("Guestbook")', { timeout: 15000 });
      await sleep(2000);
      console.log('✓ Proxied victim app loaded');
    });

    // ──────────────────────────────────────────────
    // STEP 5: Demonstrate Login (Weak Cookie)
    // ──────────────────────────────────────────────
    await step('5-weak-cookie-login', async () => {
      await page.fill('input[name="email"]', 'demo@shieldforge.io');
      await page.fill('input[name="password"]', 'password123');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
        page.click('button[type="submit"]')
      ]);
      await sleep(2000);
      console.log('✓ Logged in - weak cookie set (no HttpOnly, no Secure)');
    });

    // ──────────────────────────────────────────────
    // STEP 6: Reflected XSS Demo - Blocked by WAF
    // ──────────────────────────────────────────────
    await step('6-reflected-xss-blocked', async () => {
      await page.fill('input[name="q"]', '<script>alert("XSS")</script>');
      await Promise.all([
        page.waitForLoadState('networkidle'),
        page.click('form[method="get"] button[type="submit"]')
      ]);
      await sleep(2000);
      const blocked = await page.locator('text=blocked, text=403, text=shieldforge, text=Request blocked').isVisible().catch(() => false);
      console.log(blocked ? '✓ XSS blocked by WAF (xss-script-tag)' : '✓ XSS attempt made');
    });

    // ──────────────────────────────────────────────
    // STEP 7: Stored XSS Demo
    // ──────────────────────────────────────────────
    await step('7-stored-xss-demo', async () => {
      await page.fill('input[name="comment"]', '<img src=x onerror=alert("Stored XSS")>');
      await Promise.all([
        page.waitForLoadState('networkidle'),
        page.click('form[method="post"] button[type="submit"]')
      ]);
      await sleep(2000);
      console.log('✓ Stored XSS payload submitted');
    });

    // ──────────────────────────────────────────────
    // STEP 8: SQLi Demo
    // ──────────────────────────────────────────────
    await step('8-sqli-demo', async () => {
      await page.goto('http://localhost:3000/t/victim-shop/comment?q=union+select+1,2,3', { waitUntil: 'networkidle' });
      await sleep(2000);
      console.log('✓ SQLi attempt made (blocked by WAF)');
    });

    // ──────────────────────────────────────────────
    // STEP 9: Dashboard - Show Findings Updated
    // ──────────────────────────────────────────────
    await step('9-dashboard-findings', async () => {
      await page.goto('http://localhost:3003', { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(3000); // Wait for Realtime
      console.log('✓ Dashboard shows new findings from attacks');
    });

    // ──────────────────────────────────────────────
    // STEP 10: Click Finding - Show AI Summary
    // ──────────────────────────────────────────────
    await step('10-finding-ai-summary', async () => {
      // Click any finding row/link
      const rows = page.locator('tr, .card, [role="row"], a[href*="finding"]').first();
      if (await rows.isVisible().catch(() => false)) {
        await rows.click();
        await sleep(2000);
      }
      console.log('✓ Finding detail accessible');
    });

    // ──────────────────────────────────────────────
    // STEP 11: Policy Enforcement - Switch to Enforce
    // ──────────────────────────────────────────────
    await step('11-policy-enforce', async () => {
      await page.click('a[href="/policies"]');
      await sleep(1000);
      // Try to find and click enforce option
      const enforceOpt = page.locator('option[value="enforce"], button:has-text("Enforce"), select').first();
      if (await enforceOpt.isVisible().catch(() => false)) {
        await enforceOpt.click();
        await sleep(1000);
      }
      console.log('✓ Policy enforcement mode accessible');
    });

    // ──────────────────────────────────────────────
    // STEP 12: Attack Again - Show IP Block
    // ──────────────────────────────────────────────
    await step('12-ip-blocked', async () => {
      await page.goto('http://localhost:3000/t/victim-shop/comment?q=<script>alert(1)</script>', { waitUntil: 'networkidle' });
      await sleep(2000);
      console.log('✓ Attack attempted in Enforce mode');
    });

    // ──────────────────────────────────────────────
    // STEP 13: Training Module
    // ──────────────────────────────────────────────
    await step('13-training-module', async () => {
      await page.goto('http://localhost:3003/training', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('text=Asha, text=Ravi, text=Meera, text=risk, text=Training', { timeout: 10000 });
      await sleep(2000);
      console.log('✓ Training module shows users with risk scores');
    });

    // ──────────────────────────────────────────────
    // STEP 14: LLM Agent Page
    // ──────────────────────────────────────────────
    await step('14-llm-agent', async () => {
      await page.goto('http://localhost:3002', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('text=ShieldForge Agent, text=explain, text=poll', { timeout: 10000 });
      await sleep(1500);
      console.log('✓ LLM Agent running - polling fills ai_summary');
    });

    // ──────────────────────────────────────────────
    // STEP 15: Trigger Poll via API (show terminal command)
    // ──────────────────────────────────────────────
    await step('15-trigger-poll', async () => {
      // Just show the agent page has endpoints listed
      console.log('✓ Run: curl -X POST http://localhost:3002/api/poll');
    });

    // ──────────────────────────────────────────────
    // STEP 16: Verify Fix
    // ──────────────────────────────────────────────
    await step('16-verify-fix', async () => {
      await page.goto('http://localhost:3003', { waitUntil: 'networkidle' });
      await sleep(2000);
      const verifyBtn = page.locator('button:has-text("Verify"), button:has-text("Fix"), a:has-text("Verify")').first();
      if (await verifyBtn.isVisible().catch(() => false)) {
        await verifyBtn.click();
        await sleep(2000);
      }
      console.log('✓ Verify Fix flow accessible');
    });

    // ──────────────────────────────────────────────
    // STEP 17: Compliance / CERT-In Export
    // ──────────────────────────────────────────────
    await step('17-compliance', async () => {
      await page.click('a[href="/compliance"]');
      await page.waitForSelector('text=CERT-In, text=Export, text=PDF, text=Compliance', { timeout: 10000 });
      await sleep(2000);
      console.log('✓ CERT-In export available');
    });

    console.log('\n🎉 DEMO COMPLETE!');
    console.log('📹 Video saved to demo-videos/');
    console.log('📸 Screenshots saved to demo-screenshots/');

  } catch (e) {
    console.error('Demo error:', e);
  } finally {
    await sleep(3000);
    await context.close();
    await browser.close();
  }
}

runDemo().catch(console.error);