import fs from 'node:fs'
import path from 'node:path'

export type Message = {
  id: string
  user: string
  text: string
  ts: string
}

type VictimStore = {
  messages?: Message[]
  counters?: Record<string, number>
  loaded?: boolean
}

const store = globalThis as typeof globalThis & { __shieldVictim?: VictimStore }

function state(): VictimStore {
  if (!store.__shieldVictim) store.__shieldVictim = { messages: [], counters: {}, loaded: false }
  const value = store.__shieldVictim
  value.messages ??= []
  value.counters ??= {}
  return value
}

function dataFile(): string {
  if (process.env.VICTIM_DATA_FILE) return process.env.VICTIM_DATA_FILE
  if (process.env.VERCEL) return '/tmp/shieldforge-victim/messages.json'
  return path.join(process.cwd(), '.data', 'messages.json')
}

function load(): Message[] {
  const current = state()
  if (current.loaded) return current.messages as Message[]
  current.loaded = true
  try {
    const raw = fs.readFileSync(dataFile(), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      current.messages = parsed.filter(
        (item): item is Message =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as Message).id === 'string' &&
          typeof (item as Message).text === 'string',
      )
    }
  } catch {
    // First run, or /tmp was recycled.
  }
  return current.messages as Message[]
}

function save(messages: Message[]): void {
  try {
    const file = dataFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(messages.slice(-100)), 'utf8')
  } catch {
    // On Vercel the filesystem may be read-only; keep the in-memory copy.
  }
}

export function listMessages(): Message[] {
  return [...load()].reverse()
}

export function addMessage(user: string, text: string): Message {
  const messages = load()
  const message: Message = {
    id: crypto.randomUUID(),
    user: user.slice(0, 80) || 'guest',
    text: text.slice(0, 4000),
    ts: new Date().toISOString(),
  }
  messages.push(message)
  save(messages)
  return message
}

export function resetMessages(): void {
  const current = state()
  current.messages = []
  current.loaded = true
  save([])
}

export function bump(pathname: string): void {
  const current = state()
  const key = pathname.split('?')[0].slice(0, 120) || '/'
  current.counters![key] = (current.counters![key] ?? 0) + 1
}

export function counterSnapshot(): Record<string, number> {
  return { ...(state().counters ?? {}) }
}

export function resetCounters(): void {
  state().counters = {}
}

export function messageCount(): number {
  return load().length
}
