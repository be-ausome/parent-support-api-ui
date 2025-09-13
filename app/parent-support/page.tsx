'use client'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

type Msg = { role: 'user'|'assistant', content: string, ts: number }

function formatTime(ts: number) {
  try { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
  catch { return '' }
}

// Pull image URLs from markdown ![](url) and plain URLs; return remaining text
function extractImages(content: string) {
  const images: { url: string; alt?: string }[] = []
  let text = content

  // Markdown ![alt](url)
  const mdImg = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g
  text = text.replace(mdImg, (_: any, alt: string, url: string) => {
    images.push({ url, alt })
    return '' // strip; we'll render images separately
  })

  // Plain image URLs
  const urlRegex = /(https?:\/\/[^\s)]+?\.(?:png|jpe?g|gif|webp))(?!\S)/gi
  text = text.replace(urlRegex, (url: string) => {
    images.push({ url })
    return ''
  })

  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text, images }
}

/** Clean up model text so Markdown lists render well */
function toMarkdown(content: string) {
  let c = content.replace(/\r\n/g, '\n').replace(/[–—]/g, '-')

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

  // Inline bullets → real bullets
  c = c.replace(/:\s*-\s+/g, ':\n- ')
  c = c.replace(/([.)])\s-\s+/g, '$1\n- ')
  c = c.replace(/(\S)\s-\s(?=[A-Za-z(])/g, '$1\n- ')
  c = c.replace(/\s•\s+/g, '\n• ')

  // Numbered items inline → new line numbers
  c = c.replace(/:\s*(\d+)\.\s/g, ':\n$1. ')
  c = c.replace(/([.!?])\s+(\d+)\.\s/g, '$1\n$2. ')
  c = c.replace(/([^\n])\s(\d+)\.\s/g, (_m, p1, n) => `${p1}\n${n}. `)

  // Ensure a blank line before a list
  c = c.replace(/([^\n])\n(- |\d+\. )/g, '$1\n\n$2')

  return c.replace(/\n{3,}/g, '\n\n').trim()
}

// Pull a printable string out of our API response, old or new shapes
function pickAssistantText(d: any): string {
  if (typeof d?.result === 'string' && d.result.trim()) return d.result.trim()
  if (d?.result && typeof d.result === 'object') return JSON.stringify(d.result, null, 2)
  if (typeof d?.output_text === 'string' && d.output_text.trim()) return d.output_text.trim()

  // Very defensive fallback for Responses API chunk shapes
  const out = Array.isArray(d?.output) ? d.output : []
  const pieces: string[] = []
  for (const part of out) {
    const content = Array.isArray(part?.content) ? part.content : []
    for (const c of content) {
      if ((c?.type === 'output_text' || c?.type === 'text') && typeof c?.text === 'string') pieces.push(c.text)
      if (typeof c?.message === 'string') pieces.push(c.message)
    }
  }
  const joined = pieces.join('\n').trim()
  return joined || '(no text returned)'
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

  // Measure footer height safely (no optional-chaining after `new`)
  useEffect(() => {
    const measure = () => setFooterH(footerRef.current ? footerRef.current.offsetHeight : 0)
    measure()

    const RO: any = (typeof window !== 'undefined' && (window as any).ResizeObserver) || null
    const ro = RO ? new RO(measure) : null
    if (ro && footerRef.current) ro.observe(footerRef.current)

    window.addEventListener('resize', measure)

    return () => {
      window.removeEventListener('resize', measure)
      if (ro && typeof ro.disconnect === 'function') ro.disconnect()
    }
  }, [])

  // Rock-solid autoscroll to sentinel
  useEffect(() => {
    const go = () => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    go(); const t1 = setTimeout(go, 60); const t2 = setTimeout(go, 140)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [log, isLoading, footerH])

  // Autosize textarea
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
          mode: 'text',
          // optional thread context; harmless to keep
          thread: [...log, userMsg].map(({ role, content }) => ({ role, content }))
        })
      })

      const data = await res.json().catch(() => ({} as any))

      if (!res.ok || (data && data.error)) {
        const errStage = data?.error?.stage || 'server'
        const errMsg = data?.error?.hint || data?.error?.body || `HTTP ${res.status}`
        setErrorMsg(`[${errStage}] ${errMsg}`)
        setLog(l => [...l, { role: 'assistant', content: 'I hit a hiccup. Try again in a moment.', ts: Date.now() }])
        return
      }

      const answer = pickAssistantText(data)
      setLog(l => [...l, { role: 'assistant', content: answer, ts: Date.now() }])
    } catch (e: any) {
      setErrorMsg('Network error. Please check your connection.')
      setLog(l => [...l, { role: 'assistant', content: 'Network hiccup—try again.', ts: Date.now() }])
    } finally {
      setIsLoading(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function resetChat() { setLog([]); setInput(''); setErrorMsg(null) }

  async function copyMsg(i: number, content: string) {
    try { await navigator.clipboard.writeText(content); setCopiedIndex(i); setTimeout(() => setCopiedIndex(null), 1200) } catch {}
  }

  return (
    <div className="mx-auto max-w-5xl min-h-[100dvh] flex flex-col bg-white">
      {/* Header */}
      <header className="px-4 sm:px-6 py-5 border-b bg-white relative">
        {/* Reset button pinned to the right */}
        <button
          onClick={resetChat}
          className="chip absolute right-4 top-1/2 -translate-y-1/2"
        >
          Reset
        </button>

        {/* Centered title + subline */}
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-semibold">Be Ausome — Parent Support</h1>
          <p className="text-sm text-neutral-500">Calm, practical help. Not medical advice.</p>
        </div>
      </header>

      {/* Chat area */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6"
        style={{ paddingBottom: `calc(${footerH + 96}px + env(safe-area-inset-bottom))` }}
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
            const md = toMarkdown(text)

            return (
              <div key={i} className={`msg ${isAssistant ? 'msg-assistant' : 'msg-user'} relative`}>
                {isAssistant && (
                  <button
                    onClick={() => copyMsg(i, m.content)}
                    className="absolute -top-2 -right-2 bg-white border shadow px-2 py-0.5 rounded text-xs"
                    title="Copy"
                  >
                    {copiedIndex === i ? 'Copied' : 'Copy'}
                  </button>
                )}

                {/* Markdown-rendered content */}
                {text && (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc ml-5 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal ml-5 space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>
                    }}
                  >
                    {md}
                  </ReactMarkdown>
                )}

                {/* Images (if any) */}
                {images.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {images.map((img, idx) => (
                      <img key={idx} src={img.url} alt={img.alt || 'image'} loading="lazy" />
                    ))}
                  </div>
                )}

                <div className="meta text-right">{formatTime(m.ts)}</div>
              </div>
            )
          })}

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

          <div ref={endRef} />
        </div>
      </div>

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
