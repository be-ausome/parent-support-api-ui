import { NextRequest, NextResponse } from 'next/server'
import Ajv from 'ajv/dist/2020'   // use the 2020-12 engine
import fs from 'node:fs'
import path from 'node:path'

const ajv = new Ajv({ allErrors: true, strict: false })

function loadSchema(name: string) {
  const full = path.join(process.cwd(), 'schemas', name)
  return JSON.parse(fs.readFileSync(full, 'utf-8'))
}

function getAllowedOrigins(): string[] {
  const env = process.env.ALLOWED_ORIGINS || ''
  return env.split(',').map(s => s.trim()).filter(Boolean)
}

function corsHeaders(origin: string | null) {
  const allowed = getAllowedOrigins()
  const allow = origin && allowed.includes(origin) ? origin : allowed[0] || '*'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function extractJSONObject(text: string): any {
  try { return JSON.parse(text) } catch {}
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const maybe = text.slice(start, end + 1)
    try { return JSON.parse(maybe) } catch {}
  }
  return { __raw__: text }
}

// Read your Custom-GPT instruction files from prompts/original.
// If prompts/original/_include.txt exists, we load ONLY the listed files in that order.
// Otherwise we include every .md/.txt under prompts/original with a reasonable priority.
function readOriginalInstructions(): string {
  const base = path.join(process.cwd(), 'prompts', 'original')
  try {
    const manifest = path.join(base, '_include.txt')
    if (fs.existsSync(manifest)) {
      const picks = fs.readFileSync(manifest, 'utf-8')
        .split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      const chunks: string[] = []
      let total = 0, MAX = 120_000
      for (const rel of picks) {
        const full = path.join(base, rel)
        if (!fs.existsSync(full) || !/\.(md|txt)$/i.test(full)) continue
        let txt = fs.readFileSync(full, 'utf-8')
        if (total + txt.length > MAX) txt = txt.slice(0, MAX - total)
        chunks.push(`\n\n### Source: ${rel}\n\n` + txt)
        total += txt.length
        if (total >= MAX) break
      }
      return chunks.join('')
    }

    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name)
        const st = fs.statSync(full)
        if (st.isDirectory()) walk(full)
        else if (/\.(md|txt)$/i.test(name)) files.push(full)
      }
    }
    walk(base)

    const priority = [
      'system','main_system','identity','core','command_router',
      'router','tone','taboo','non-negotiables','guardrail'
    ]
    const rank = (p: string) => {
      const lower = p.toLowerCase()
      for (let i = 0; i < priority.length; i++) if (lower.includes(priority[i])) return i
      return priority.length
    }
    files.sort((a,b) => rank(a) - rank(b) || a.localeCompare(b))

    let total = 0, MAX = 120_000
    const chunks: string[] = []
    for (const full of files) {
      let txt = fs.readFileSync(full, 'utf-8')
      if (total + txt.length > MAX) txt = txt.slice(0, MAX - total)
      chunks.push(`\n\n### Source: ${path.relative(base, full)}\n\n` + txt)
      total += txt.length
      if (total >= MAX) break
    }
    return chunks.join('')
  } catch {
    return ''
  }
}

async function openaiChat(body: any) {
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const key = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini' // JSON-friendly default
  if (!key) throw new Error('Missing OPENAI_API_KEY')
  body.model = model

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${text}`)
  return JSON.parse(text)
}

async function callOpenAI(prompt: string, mode: string) {
  // Base system pointer
  const systemPath = path.join(process.cwd(), 'prompts', 'system.md')
  let system = 'You are a calm, concise Parent Support assistant.'
  try { system = fs.readFileSync(systemPath, 'utf-8') } catch {}

  // Voice charter (answer shape + taboos)
  let voice = ''
  try { voice = fs.readFileSync(path.join(process.cwd(), 'prompts', 'style', 'voice.md'), 'utf-8') } catch {}

  // Few-shot examples (JSON array of messages)
  let fewshots: any[] = []
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'prompts', 'fewshot', 'parent_support.json'), 'utf-8')
    const arr = JSON.parse(raw); if (Array.isArray(arr)) fewshots = arr
  } catch {}

  // Your full Custom-GPT instructions
  const original = readOriginalInstructions()

  // Build the system content and messages
  const baseSystem = [system, voice, original].filter(Boolean).join('\n\n')
  let schemaName: string | null = null
  if (mode === 'support_plan') schemaName = 'support_plan.schema.json'
  if (mode === 'social_story') schemaName = 'social_story.schema.json'
  if (mode === 'routine_plan') schemaName = 'routine_plan.schema.json'

  const baseMessages: any[] = [{ role: 'system', content: baseSystem }, ...fewshots]

  // TEXT MODE — tuned for your voice
  if (!schemaName) {
    const data = await openaiChat({
      messages: [...baseMessages, { role: 'user', content: prompt }],
      temperature: 0.55,
      top_p: 0.9,
      presence_penalty: 0.1,
      frequency_penalty: 0.2
    })
    const text = data.choices?.[0]?.message?.content ?? ''
    return { kind: 'text', text }
  }

  // JSON MODE — robust (no 500s on schema mismatch)
  const schema = loadSchema(schemaName)

  // Attempt 1: json_object (works well with 4o/mini)
  let data: any
  try {
    data = await openaiChat({
      messages: [...baseMessages,
        { role: 'system', content: 'Reply with JSON only that strictly matches the provided schema. No code fences or extra text.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })
  } catch {
    // Attempt 2: strong instruction, no response_format
    data = await openaiChat({
      messages: [...baseMessages,
        { role: 'system', content: 'Return JSON only. No prose. No code fences. Match the schema exactly.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    })
  }

  const text = data.choices?.[0]?.message?.content ?? '{}'
  const parsed = extractJSONObject(text)
  const validate = ajv.compile(schema)
  const valid = validate(parsed)
  if (!valid) {
    return { kind: 'json', payload: { __repair__: validate.errors, raw: parsed } }
  }
  return { kind: 'json', payload: parsed }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin')
  return new NextResponse(null, { headers: corsHeaders(origin) })
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const { message, mode } = await req.json()
  try {
    const result = await callOpenAI(message, mode || 'text')
    return NextResponse.json(result, { headers: corsHeaders(origin) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: corsHeaders(origin) })
  }
}
