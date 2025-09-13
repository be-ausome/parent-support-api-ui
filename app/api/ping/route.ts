// app/api/ping/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";

const URL = "https://api.openai.com/v1/responses";

export async function GET() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key.length < 20) {
    return NextResponse.json({ ok: false, stage: "env", detail: "OPENAI_API_KEY missing" }, { status: 500 });
  }
  try {
    const r = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL_TEXT || "gpt-4.1-mini",
        input: [{ role: "user", content: "ping" }],
        max_output_tokens: 8
      })
    });
    const text = await r.text();
    if (!r.ok) return NextResponse.json({ ok: false, stage: "openai", status: r.status, body: text }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, stage: "network", detail: String(e?.message || e) }, { status: 502 });
  }
}
