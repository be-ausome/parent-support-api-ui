'use client'
import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'user'|'assistant', content: string }

export default function ParentSupportPage() {
  const [input, setInput] = useState('')
  const [log, setLog] = useState<Msg[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Presets with spacing
  const presets = [
    'We are going to a baseball game. Make a visual schedule for the outing (age 15).',
    'Morning routine meltdown. Need a 5-step bridge.',
    'Grocery store is loud. Lines are hard—short plan with a break signal.',
    'Dentist visit Thursday—help with a visual strip (age 10).'
  ]

  // Auto-scroll on new messages
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' })
  }, [log, isLoading])

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return

    setLog(l => [...l, { role: 'user', content: text }])
    setInput('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Always text mode now; include thread for context
        body: JSON.stringify({ message: text, mode: 'text', thread: [...log, { role: 'user', content: text }] })
      })
      const data = await res.json()
      if (!res.ok) {
        setLog(l => [...l, { role: 'assistant', content: `Hmm, I hit an error: ${data.error || res.status}` }])
      } else {
        const answer = data.kind === 'json'
          ? 'I’m set up for text only here. (JSON was returned by the API.)'
          : data.text
        setLog(l => [...l, { role: 'assistant', content: answer }])
      }
    } catch (err: any) {
      setLog(l => [...l, { role: 'assistant', content: 'Network hiccup—try again.' }])
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
  }

  return (
    <div className="mx-auto max-w-4xl min-h-screen flex flex-col">
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
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {presets.map(p => (
            <button key={p} type="button" className="chip" onClick={() => setInput(p)}>
              {p}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {log.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>
              {m.content}
            </div>
          ))}

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

      {/* Sticky input at bottom */}
      <form onSubmit={sendMessage} className="footer">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-3">
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={3}
              placeholder="Describe the situation… (Enter to send, Shift+Enter for new line)"
              className="w-full resize-none rounded-xl border bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ minHeight: 60 }}
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
