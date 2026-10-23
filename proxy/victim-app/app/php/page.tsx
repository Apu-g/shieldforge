import { appUrl, VULNERABLE } from '@/lib/config'
import { bump } from '@/lib/store'

export const dynamic = 'force-dynamic'

export default async function PhpPage() {
  bump('/php')
  return (
    <section className="panel">
      <h1>PHP lab</h1>
      <p>
        This page pretends to accept PHP. Nothing is executed: the route returns a simulated
        output. The point is to give the proxy a realistic <code>&lt;?php system(...) ?&gt;</code>{' '}
        body to inspect.
      </p>
      <div className="notice">
        Requests containing <code>&lt;?php</code>, <code>system(</code>, <code>eval(</code>,{' '}
        <code>base64_decode(</code> or <code>php://filter</code> should be blocked with 403 before
        this app sees them.
      </div>
      <form action={appUrl('/api/php')} method="post">
        <label htmlFor="code">PHP source</label>
        <textarea
          id="code"
          name="code"
          rows={5}
          defaultValue={"<?php system('id'); ?>"}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button type="submit">Send</button>
          <span className="tiny">Mode: {VULNERABLE ? 'vulnerable' : 'hardened'}</span>
        </div>
      </form>
    </section>
  )
}
