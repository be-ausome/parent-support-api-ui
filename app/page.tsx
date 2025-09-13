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
 * - break numbered lists onto new lines (1. 2. 3.)
 * - compact extra blank lines
 */
function prettifyText(content: string) {
  let c = content.replace(/\r\n/g, '\n')

  // Normalize en/em dashes to a plain hyphen for easier matching
  c = c.replace(/[–—]/g, '-')

  // Newline after common headers (with/without a colon)
  const headers = [
    "What’s likely happening","What's likely happening",
    "What’s underneath","Underneath",
    "What’s happening","What's happening",
    "What might help","What may help",
    "Bridge moves","Bridge ideas","Next steps","Options","Try this"
  ]
  for (const h of headers) {
    const re = new RegExp(`(^|\\n)\\s*${h}:?\\s*`, 'gi')
    c = c.replace(re, (_m, p1) => `${p1}${h}:\n`)
  }

  // Dash bullets that run inline → newline bullets
  c = c.replace(/:\s*-\s+/g, ':\n- ')            // after a colon
  c = c.replace(/([.)])\s-\s+/g, '$1\n- ')       // after . or )
  c = c.replace(/(\S)\s-\s(?=[A-Za-z(])/g, '$1\n- ') // general case
  c = c.replace(/"\s-\s+/g, '"\n- ')             // after a quote
  c = c.replace(/\s•\s+/g, '\n• ')               // dot bullets

  // Numbered lists that run inline → newline numbers
  //  "... Bridge moves: 1. Tip 2. Tip" -> "...\n1. Tip\n2. Tip"
  c = c.replace(/:\s*(\d+)\.\s/g, ':\n$1. ')
  c = c.replace(/([.!?])\s+(\d+)\.\s/g, '$1\n$2. ')
  c = c.replace(/([^\n])\s(\d+)\.\s/g, (_m, p1, n) => `${p1}\n${n}. `) // fallback

  // Collapse extra blank lines
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
  const endRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const footerRef = useRef<HTMLFormElement>(null)
  const [footerH, setFooterH] = useState(0)

  const presets = [
    'We are going to a baseball game. Make a visual schedule for the outing (age 15).',
    'Morning routine meltdown. Need a 5-step bridge.',
    'Grocery store is loud. Lines are hard—short plan with a break signal.',
    'Dentist visit Thursday—help with a visual strip (age 10).'
  ]

  // Measure footer height so content never hides behind it
  useEffect(() => {
    const measure = () => setFooterH(footerRef.current?.offsetHeight ?? 0)
    measure()
    const ro = new (window as any).ResizeObserver?.(measure)
    if (ro && footerRef.current) ro.observe(footerRef.current)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      ro?.disconnect?.()
    }
  }, [])

  // Rock-solid autoscroll: scroll to sentinel now + after layout settles
  useEffect(() => {
    const go = () => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    go()
    const t1 = setTimeout(go, 60)
    const t2 = setTimeout(go, 140)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [log, isLoading, footerH])

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
    <div className="mx-auto max-w-5xl min-h-[100dvh] flex flex-col bg-white">
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
        style={{
          // Enough space so the last message clears the sticky footer (plus iOS safe-area)
          paddingBottom: `calc(${footerH + 96}px + env(safe-area-inset-bottom))`
        }}
      >
        {/* Presets row */}
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            'We are going to a baseball game. Make a visual schedule for the outing (age 15).',
            'Morning routine meltdown. Need a 5-step bridge.',
            'Grocery store is loud. Lines are hard—short plan with a break signal.',
            'Dentist visit Thursday—help with a visual strip (age 10).'
          ].map(p => (
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
                {text && <div className="whitespace-pre-wrap leading-relaxed">{prettifyText(text)}</div>}

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

          {/* Scroll sentinel */}
          <div ref={endRef} />
        </div>
      </div>

      {/* Error toast */}
      {errorMsg && <div className="toast">{errorMsg}</div>}

      {/* Sticky input */}
      <form ref={footerRef} onSubmit={sendMessage} className="footer">
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
