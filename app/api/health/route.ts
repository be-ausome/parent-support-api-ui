import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET() {
  const k = process.env.OPENAI_API_KEY || "";
  return NextResponse.json({
    ok: !!k && k.length > 20,
    key_preview: k ? `${k.slice(0,7)}…${k.slice(-4)}` : null,
    text_model: process.env.OPENAI_MODEL_TEXT || null,
    json_model: process.env.OPENAI_MODEL_JSON || null
  });
}
