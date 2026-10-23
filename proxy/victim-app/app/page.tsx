import { cookies } from 'next/headers'
import { appUrl, VULNERABLE } from '@/lib/config'
import { bump } from '@/lib/store'

export const dynamic = 'force-dynamic'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sqli?: string; loggedout?: string }>
}) {
  bump('/')
  const params = await searchParams
  const cookieStore = await cookies()
  const user = cookieStore.get('sf_user')?.value

  return (
    <>
      <section className="panel">
        <h1>Victim Shop</h1>
        <p>
          A deliberately weak login and guestbook. The ShieldForge proxy is supposed to block the
          nasty requests before they ever reach this app.
        </p>

        {params.sqli ? (
          <div className="notice">
            Simulated SQL injection bypass accepted. You are signed in as <strong>admin</strong>.
            The WAF does not catch this variant on purpose.
          </div>
        ) : null}
        {params.loggedout ? <div className="ok">Signed out.</div> : null}

        <div className="grid-2">
          <div>
            <h2>{user ? `Signed in as ${user}` : 'Sign in'}</h2>
            <form action={appUrl('/api/login')} method="post">
              <div style={{ marginBottom: 10 }}>
                <label htmlFor="username">Username</label>
                <input id="username" name="username" defaultValue="demo" autoComplete="off" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="text"
                  defaultValue="demo123"
                  autoComplete="off"
                />
              </div>
              <button type="submit">Sign in</button>
            </form>
            <p className="tiny" style={{ marginTop: 10 }}>
              Vulnerable mode reflects the password back on the response page, which is the
              reflected-XSS sink. Do not reuse a real password here.
            </p>
          </div>

          <div>
            <h2>What to try</h2>
            <ul className="tiny" style={{ lineHeight: 1.9, paddingLeft: 18 }}>
              <li>
                Password: <code>&lt;script&gt;alert(1)&lt;/script&gt;</code> — should be 403 at the
                proxy.
              </li>
              <li>
                Password: <code>&apos; OR 1=1--</code> — should be 403 (tautology rule).
              </li>
              <li>
                Password: <code>&apos; OR &apos;a&apos;=&apos;a</code> — passes and signs you in as
                admin.
              </li>
              <li>
                Chat: <code>&lt;img src=x onerror=alert(1)&gt;</code> — blocked.
              </li>
              <li>
                Chat: entity-encoded <code>&lt;details ontoggle=...&gt;</code> — a documented
                response-side gap.
              </li>
            </ul>
            <div className="notice" style={{ marginTop: 12 }}>
              Mode: <strong>{VULNERABLE ? 'vulnerable' : 'hardened'}</strong>. Set{' '}
              <code>VICTIM_VULNERABLE=false</code> and redeploy to compare.
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Routes in this lab</h2>
        <div className="grid-2">
          <div>
            <p>
              <a href={appUrl('/chat')}>/chat</a> — stored comments, raw HTML in vulnerable mode.
            </p>
            <p>
              <a href={appUrl('/search')}>/search</a> — reflected query and a naive auth filter.
            </p>
          </div>
          <div>
            <p>
              <a href={appUrl('/files')}>/files</a> — simulated traversal sink. Never reads disk.
            </p>
            <p>
              <a href={appUrl('/php')}>/php</a> — simulated PHP endpoint. Never executes code.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
