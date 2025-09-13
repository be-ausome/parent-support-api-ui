'use client'
import { useState } from 'react'

export default function ParentSupportPage() {
  const [input, setInput] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [mode, setMode] = useState<'text'|'support_plan'|'social_story'|'routine_plan'>('text')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLog(l => [...l, `You: ${input}`])
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input, mode })
    })
    if (!res.ok) {
      setLog(l => [...l, `Error: ${res.status} ${res.statusText}`])
      return
    }
    const data = await res.json()
    if (data.kind === 'json') {
      setLog(l => [...l, `Assistant (JSON ${mode}):\n` + JSON.stringify(data.payload, null, 2)])
    } else {
      setLog(l => [...l, `Assistant: ${data.text}`])
    }
    setInput('')
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-2xl font-bold">Parent Support</h1>
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
