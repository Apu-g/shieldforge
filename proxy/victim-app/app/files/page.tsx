import { appUrl, VULNERABLE } from '@/lib/config'
import { bump } from '@/lib/store'

export const dynamic = 'force-dynamic'

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>
}) {
  bump('/files')
  const params = await searchParams
  const name = String(params.name ?? '').slice(0, 300)

  return (
    <section className="panel">
      <h1>File viewer</h1>
      <p>
        A simulation of the classic PHP <code>include($_GET[&apos;file&apos;])</code> mistake. It
        never reads the real filesystem; a traversal-looking name returns a fake{' '}
        <code>/etc/passwd</code>.
      </p>
      <div className="notice">
        The proxy should return 403 for any request containing <code>../</code>. If you reach this
        page directly on the origin, the app happily returns fake content — that is the
        consequence of bypassing the proxy.
      </div>
      <form action={appUrl('/files')} method="get">
        <label htmlFor="name">File name</label>
        <div className="row">
          <input id="name" name="name" defaultValue={name || '../../etc/passwd'} />
          <button type="submit">Read</button>
        </div>
      </form>
      {name ? (
        <div style={{ marginTop: 16 }}>
          <h2>Result</h2>
          {!VULNERABLE ? (
            <div className="ok">Hardened mode rejects traversal before rendering.</div>
          ) : /(\.\.|\/etc\/passwd|\/proc\/self)/i.test(name) ? (
            <pre className="code">
              root:x:0:0:root:/root:/bin/bash{'\n'}daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
              {'\n'}(fake demo content — no real file was read)
            </pre>
          ) : (
            <div className="code">No such fake file: {name}</div>
          )}
        </div>
      ) : null}
    </section>
  )
}
