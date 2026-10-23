import type { Metadata } from 'next'
import { appUrl, VULNERABLE } from '@/lib/config'
import './globals.css'

export const metadata: Metadata = {
  title: 'ShieldForge Victim Shop',
  description: 'Deliberately vulnerable demo app for the ShieldForge reverse proxy.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <span className="brand">ShieldForge Victim</span>
            <a href={appUrl('/')}>Login</a>
            <a href={appUrl('/chat')}>Chat</a>
            <a href={appUrl('/search')}>Search</a>
            <a href={appUrl('/files')}>Files</a>
            <a href={appUrl('/php')}>PHP lab</a>
            <a href={appUrl('/profile')}>Profile</a>
            <span className={`pill ${VULNERABLE ? 'bad' : 'good'}`}>
              {VULNERABLE ? 'vulnerable mode' : 'hardened mode'}
            </span>
          </nav>
          {children}
          <div className="footer">
            Intentionally insecure demo app for ShieldForge. Fake accounts and fake data only. No
            real authentication, no real file access, and no PHP execution.
          </div>
        </div>
      </body>
    </html>
  )
}
