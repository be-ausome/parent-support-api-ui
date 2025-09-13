'use client'
import { useState } from 'react'

type Msg = { role: 'user'|'assistant', content: string }

export default function ParentSupportPage() {
  const [input, setInput] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [mode, setMode] = useState<'text'|'support_plan'|'social_story'|'routine_plan'>('text')
  const [thread, setThread] = useState<Msg[]>([]) // session memory

  const presets = [
    'We are going to a baseball game. Make a visual schedule for the outing (age 15).',
    'Morning routine meltdown. Need a 5-step bridge.',
    'Grocery store is loud. Lines are hard—give a short plan.',
  ]

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const userMsg = input.trim()
    if (!userMsg) return
    setLog(l => [...l, `You: ${userMsg}`])
    setThread(t => [...t, { role: 'user', content: userMsg }])
    setInput('')

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMsg, mode, thread: [...thread, { role: 'user', content: userMsg }] })
    })

    const data = await res.json()
    if (!res.ok) {
      setLog(l => [...l, `Error: ${data.error || res.status}`])
      return
    }

    if (data.kind === 'json') {
      const jsonText = JSON.stringify(data.payload, null, 2)
      setLog(l => [...l, `Assistant (JSON ${mode}):\n` + jsonText])
      setThread(t => [...t, { role: 'assistant', content: jsonText }])
    } else {
      setLog(l => [...l, `Assistant: ${data.text}`])
      setThread(t => [...t, { role: 'assistant', content: data.text }])
    }
  }

  function onReset() {
    setInput('')
    setLog([])
    setThread([])
    setMode('text')
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-2xl font-bold">Parent Support</h1>

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {presets.map(p => (
          <button key={p} type="button" onClick={() => setInput(p)} className="border px-2 py-1 text-sm">
            {p}
          </button>
        ))}
        <button type="button" onClick={onReset} className="ml-auto border px-2 py-1 text-sm">Reset</button>
      </div>

      <form onSubmit={onSubmit} className="space-y-2">
        <textarea value={input} onChange={e=>setInput(e.target.value)}
          className="w-full border p-2" rows={4} placeholder="Describe the situation..." />
        <div className="flex items-center gap-3">
          <label className="text-sm">Output:</label>
          <select value={mode} onChange={e=>setMode(e.target.value as any)} className="border p-1">
            <option value="text">Text</option>
            <option value="support_plan">Support Plan (JSON)</option>
            <option value="social_story">Social Story (JSON)</option>
            <option value="routine_plan">Routine Plan (JSON)</option>
          </select>
          <button type="submit" className="ml-auto border px-3 py-1">Ask</button>
        </div>
      </form>

      <pre className="whitespace-pre-wrap bg-gray-50 p-3 border rounded min-h-[200px]">{log.join('\n\n')}</pre>
    </main>
  )
}
