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

async function callOpenAI(prompt: string, mode: string) {
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const key = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-5o-mini'
  if (!key) throw new Error('Missing OPENAI_API_KEY')

  // Load system prompt from prompts/system.md + original sources (kept in repo)
  let system = fs.readFileSync(path.join(process.cwd(), 'prompts', 'system.md'), 'utf-8')

  // If JSON mode, add a tool/response contract
  let schemaName: string | null = null
  if (mode === 'support_plan') schemaName = 'support_plan.schema.json'
  if (mode === 'social_story') schemaName = 'social_story.schema.json'
  if (mode === 'routine_plan') schemaName = 'routine_plan.schema.json'

  const messages: any[] = [{ role: 'system', content: system } , { role: 'user', content: prompt }]

  const body: any = {
    model,
    messages,
    temperature: 0.3,
  }

  if (schemaName) {
    // Use JSON schema as guiding instruction
    const schema = loadSchema(schemaName)
    body.response_format = { type: 'json_schema', json_schema: { name: schema.title || 'AusomeShape', schema } }
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI error ${res.status}: ${errText}`)
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? ''

  if (schemaName) {
    const parsed = JSON.parse(text)
    const validate = ajv.compile(loadSchema(schemaName))
    const valid = validate(parsed)
    if (!valid) {
      return { kind: 'json', payload: { __repair__: validate.errors, raw: parsed } }
    }
    return { kind: 'json', payload: parsed }
  }
  return { kind: 'text', text }
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
