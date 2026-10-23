import { cookies } from 'next/headers'
import { appUrl, VULNERABLE } from '@/lib/config'
import { decodeEntities } from '@/lib/html'
import { bump, listMessages } from '@/lib/store'

export const dynamic = 'force-dynamic'

export default async function ChatPage() {
  bump('/chat')
  const cookieStore = await cookies()
  const user = cookieStore.get('sf_user')?.value
  const messages = listMessages()

  return (
    <>
      <section className="panel">
        <h1>Guestbook</h1>
        <p>
          Vulnerable mode decodes HTML entities and renders raw HTML. That is the stored-XSS sink.
          Hardened mode escapes the text.
        </p>
        {!user ? (
          <div className="notice">
            You are posting as <strong>guest</strong>. <a href={appUrl('/')}>Sign in</a> first to
            see a weak session cookie.
          </div>
        ) : null}
        <form action={appUrl('/api/comment')} method="post">
          <label htmlFor="text">Message</label>
          <textarea id="text" name="text" rows={3} placeholder="Hello from the lab" />
          <div className="row" style={{ marginTop: 10 }}>
            <button type="submit">Post</button>
            {VULNERABLE ? (
              <span className="tiny">
                Rendering: <code>dangerouslySetInnerHTML(decodeEntities(text))</code>
              </span>
            ) : (
              <span className="tiny">Rendering: escaped text</span>
            )}
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Messages ({messages.length})</h2>
        {messages.length === 0 ? (
          <p className="tiny">No messages yet.</p>
        ) : (
          <div className="messages">
            {messages.map((message) => (
              <div className="message" key={message.id}>
                <div className="meta">
                  {message.user} · {new Date(message.ts).toLocaleString()}
                </div>
                {VULNERABLE ? (
                  <div dangerouslySetInnerHTML={{ __html: decodeEntities(message.text) }} />
                ) : (
                  <div>{message.text}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
