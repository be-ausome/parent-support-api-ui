'use client'
import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'user'|'assistant', content: string, ts: number }

function formatTime(ts: number) {
  try { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
  catch { return '' }
}

// Pull image URLs from markdown ![](url) and plain URLs
function extractImages(content: string) {
  const images: { url: string; alt?: string }[] = []
  let text = content

  // Markdown ![alt](url)
  const mdImg = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g
  text = text.replace(mdImg, (_: any, alt: string, url: string) => {
    images.push({ url, alt })
    return '' // strip from text
  })

  // Plain image URLs
  const urlRegex = /(https?:\/\/[^\s)]+?\.(?:png|jpe?g|gif|webp))(?!\S)/gi
  text = text.replace(urlRegex, (url: string) => {
    images.push({ url })
    return '' // strip from text
  })

  text = text.replace(/\n{3,}/g, '\n\n').trim()
  return { text, images }
}

/** Make model output easier to read:
 * - enforce line breaks after common section headers
 * - convert inline dashes ( -, – , — ) into real bullets
 * - compact extra blank lines
 */
function prettifyText(content: string) {
  let c = content

  // Newline after common headers
  c = c.replace(
    /(What’s likely happening:|What's likely happening:|What’s underneath:|Underneath:|Bridge moves:|Bridge ideas:|What may help:|What’s happening:|What's happening:)/g,
    '$1\n'
  )

  // Turn inline dash bullets into line-start bullets (supports -, – , —)
  c = c.replace(/([:\.;])\s*[–—-]\s+/g, '$1\n- ') // after :, ., ;
  // If a paragraph contains multiple spaced dashes, make them bullets
  c = c.replace(/(\S)\s+[–—-]\s+/g, '$1\n- ')     // general case
  // Dot bullets
  c = c.replace(/\s•\s+/g, '\n• ')

  // Ensure existing start-of-line dashes are on their own line
  c = c.replace(/(?:^|\n)\s*[–—]\s+/g, m => m.replace(/[–—]/, '- '))

  // Compact excessive blank lines
  c = c.replace(/\n{3,}/g, '\n\n').trim()
  return c
}

export default function ParentSupportPage() {
  const [input, setInput] = useState('')
  const [log, setLog] = useState<Msg[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const presets = [
    'We are going to a baseball game. Make a visual schedule for the outing (age 15).',
    'Morning routine meltdown. Need a 5-step bridge.',
    'Grocery store is loud. Lines are hard—short plan with a break signal.',
    'Dentist visit Thursday—help with a visual strip (age 10).'
  ]

  // Auto-scroll on new messages and after layout settles
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const toBottom = () => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    toBottom()
    const t = setTimeout(toBottom, 50)
    return () => clearTimeout(t)
  }, [log, isLoading])

  // Autosize textarea as you type
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    const handler = () => {
      ta.style.height = '0px'
      ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'
    }
    handler()
    ta.addEventListener('input', handler)
    return () => ta.removeEventListener('input', handler)
  }, [])

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg: Msg = { role: 'user', content: text, ts: Date.now() }
    setLog(l => [...l, userMsg])
    setInput('')
    setIsLoading(true)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          mode: 'text', // always text
          thread: [...log, userMsg].map(({ role, content }) => ({ role, content }))
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || `HTTP ${res.status}`)
        setLog(l => [...l, { role: 'assistant', content: 'I hit a hiccup. Try again in a moment.', ts: Date.now() }])
      } else {
        const answer = data.kind === 'json'
          ? 'I’m set up for text here. (The API returned JSON.)'
          : (data.text || '')
        setLog(l => [...l, { role: 'assistant', content: answer, ts: Date.now() }])
      }
    } catch {
      setErrorMsg('Network error. Please check your connection.')
      setLog(l => [...l, { role: 'assistant', content: 'Network hiccup—try again.', ts: Date.now() }])
    } finally {
      setIsLoading(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function resetChat() {
    setLog([])
    setInput('')
    setErrorMsg(null)
  }

  async function copyMsg(i: number, content: string) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedIndex(i)
      setTimeout(() => setCopiedIndex(null), 1200)
    } catch { /* ignore */ }
  }

  return (
    <div className="mx-auto max-w-5xl min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="px-4 sm:px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-blue-600" />
          <div>
            <h1 className="text-lg font-semibold">Be Ausome — Parent Support</h1>
            <p className="text-sm text-neutral-500">Calm, practical help. Not medical advice.</p>
          </div>
          <div className="ml-auto">
            <button onClick={resetChat} className="chip">Reset</button>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6"
        // Enough space so the last message clears the sticky footer (plus safe-area)
        style={{ paddingBottom: 'calc(14rem + env(safe-area-inset-bottom))' }}
      >
        {/* Presets row */}
        <div className="flex flex-wrap gap-2 mb-4">
          {presets.map(p => (
            <button key={p} type="button" className="chip" onClick={() => setInput(p)}>
              {p}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="space-y-4">
          {log.map((m, i) => {
            const { text, images } = extractImages(m.content)
            const isAssistant = m.role === 'assistant'
            return (
              <div key={i} className={`msg ${isAssistant ? 'msg-assistant' : 'msg-user'} relative`}>
                {/* Copy button on assistant bubbles */}
                {isAssistant && (
                  <button
                    onClick={() => copyMsg(i, m.content)}
                    className="absolute -top-2 -right-2 bg-white border shadow px-2 py-0.5 rounded text-xs"
                    title="Copy"
                  >
                    {copiedIndex === i ? 'Copied' : 'Copy'}
                  </button>
                )}

                {/* Text content with pretty line breaks */}
                {text && <div className="whitespace-pre-wrap">{prettifyText(text)}</div>}

                {/* Images (if any) */}
                {images.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {images.map((img, idx) => (
                      <img key={idx} src={img.url} alt={img.alt || 'image'} loading="lazy" />
                    ))}
                  </div>
                )}

                {/* Timestamp */}
                <div className="meta text-right">{formatTime(m.ts)}</div>
              </div>
            )
          })}

          {/* Thinking bubble */}
          {isLoading && (
            <div className="msg msg-assistant inline-flex items-center gap-2">
              <span className="text-neutral-500">Thinking</span>
              <span className="typing">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Error toast */}
      {errorMsg && <div className="toast">{errorMsg}</div>}

      {/* Sticky input */}
      <form onSubmit={sendMessage} className="footer">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3">
          <div className="flex items-end gap-3">
            <textarea
              ref={taRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={3}
              placeholder="Describe the situation… (Enter to send, Shift+Enter for new line)"
              className="w-full resize-none rounded-xl border bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ minHeight: 60, maxHeight: 220 }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="rounded-xl bg-blue-600 text-white px-4 py-2 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
