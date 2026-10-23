'use client'

import { useEffect, useState } from 'react'

export default function CookieProbe() {
  const [cookie, setCookie] = useState('')
  const [href, setHref] = useState('')

  useEffect(() => {
    setCookie(document.cookie || '(empty)')
    setHref(window.location.href)
  }, [])

  return (
    <div>
      <h2>What JavaScript can read</h2>
      <p className="tiny">
        In vulnerable mode <code>sf_session</code> appears here. In hardened mode the cookie is
        HttpOnly, so this box stays empty even if an attacker injects script.
      </p>
      <div className="cookie-box">{cookie || '(empty)'}</div>
      <p className="tiny" style={{ marginTop: 10 }}>
        Page URL: {href}
      </p>
      <button
        className="secondary"
        type="button"
        style={{ marginTop: 10 }}
        onClick={() => setCookie(document.cookie || '(empty)')}
      >
        Refresh
      </button>
    </div>
  )
}
