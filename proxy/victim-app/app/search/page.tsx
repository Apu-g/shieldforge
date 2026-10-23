import { appUrl, VULNERABLE } from '@/lib/config'
import { decodeEntities, escapeHtml } from '@/lib/html'
import { bump } from '@/lib/store'

export const dynamic = 'force-dynamic'

const FAKE_USERS = ['admin', 'demo', 'billing', 'support']

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  bump('/search')
  const params = await searchParams
  const q = String(params.q ?? '').slice(0, 500)
  const bypass = VULNERABLE && /'\s*or\s+/i.test(q)

  return (
    <>
      <section className="panel">
        <h1>Search</h1>
        <p>
          Reflected query plus a fake filter. The app does not use SQL; the bypass only returns
          fake users so you can see the result.
        </p>
        <form action={appUrl('/search')} method="get">
          <label htmlFor="q">Search users</label>
          <div className="row">
            <input id="q" name="q" defaultValue={q} placeholder="demo" />
            <button type="submit">Search</button>
          </div>
        </form>

        {q ? (
          <div style={{ marginTop: 18 }}>
            <h2>Results for</h2>
            {VULNERABLE ? (
              <div dangerouslySetInnerHTML={{ __html: decodeEntities(q) }} />
            ) : (
              <div>{q}</div>
            )}
            {bypass ? (
              <div className="notice">
                Naive filter accepted the quote/OR form. Returning every fake user. This is the
                SQLi bypass that the current rules miss.
              </div>
            ) : null}
            <div className="messages">
              {(bypass ? FAKE_USERS : FAKE_USERS.filter((user) => user.includes(q))).map((user) => (
                <div className="message" key={user}>
                  {VULNERABLE ? (
                    <div dangerouslySetInnerHTML={{ __html: decodeEntities(user) }} />
                  ) : (
                    <div>{escapeHtml(user)}</div>
                  )}
                </div>
              ))}
              {!bypass && !FAKE_USERS.some((user) => user.includes(q)) ? (
                <p className="tiny">No fake users matched.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </>
  )
}
