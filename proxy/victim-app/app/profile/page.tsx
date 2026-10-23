import { cookies } from 'next/headers'
import { appUrl, VULNERABLE } from '@/lib/config'
import { bump } from '@/lib/store'
import CookieProbe from './CookieProbe'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  bump('/profile')
  const cookieStore = await cookies()
  const names = cookieStore.getAll().map((cookie) => cookie.name)

  return (
    <>
      <section className="panel">
        <h1>Profile</h1>
        <p>
          Mode: <strong>{VULNERABLE ? 'vulnerable' : 'hardened'}</strong>. Cookies present:{' '}
          {names.length > 0 ? names.join(', ') : 'none'}.
        </p>
        <CookieProbe />
        <div style={{ marginTop: 18 }}>
          <form action={appUrl('/api/logout')} method="post">
            <button className="secondary" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>
      <section className="panel">
        <h2>Cookie-theft test</h2>
        <p>
          In vulnerable mode, a stored-XSS payload can read <code>document.cookie</code> and send
          it to the attacker listener. In hardened mode the session cookie is HttpOnly, so the
          script sees nothing. The proxy records the cookie flags either way.
        </p>
      </section>
    </>
  )
}
