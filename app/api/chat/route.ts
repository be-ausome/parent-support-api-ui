import { NextRequest, NextResponse } from 'next/server'
import Ajv from 'ajv'
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

async function openaiChat(body: any) {
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const key = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-5o-mini'
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
  const systemPath = path.join(process.cwd(), 'prompts', 'system.md')
  let system = 'You are a calm, concise Parent Support assistant.'
  try { system = fs.readFileSync(systemPath, 'utf-8') } catch {}

  let schemaName: string | null = null
  if (mode === 'support_plan') schemaName = 'support_plan.schema.json'
  if (mode === 'social_story') schemaName = 'social_story.schema.json'
  if (mode === 'routine_plan') schemaName = 'routine_plan.schema.json'

  const messages: any[] = [{ role: 'system', content: system }, { role: 'user', content: prompt }]

  // Text path
  if (!schemaName) {
    const data = await openaiChat({ messages, temperature: 0.3 })
    const text = data.choices?.[0]?.message?.content ?? ''
    return { kind: 'text', text }
  }

  // JSON path with robust fallback
  const schema = loadSchema(schemaName)
  let data: any
  try {
    // Try schema-constrained first
    data = await openaiChat({
      messages,
      temperature: 0.2,
      response_format: { type: 'json_schema', json_schema: { name: schema.title || 'AusomeShape', schema } }
    })
  } catch {
    // Fallback to plain JSON object mode
    data = await openaiChat({
      messages: [
        messages[0],
        { role: 'system', content: 'Reply with JSON only. No code fences or extra text.' },
        messages[1],
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })
  }

  const text = data.choices?.[0]?.message?.content ?? '{}'
  const parsed = extractJSONObject(text)
  const validate = ajv.compile(schema)
  const valid = validate(parsed)
  if (!valid) return { kind: 'json', payload: { __repair__: validate.errors, raw: parsed } }
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
