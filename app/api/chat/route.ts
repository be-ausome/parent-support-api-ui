// app/api/chat/route.ts (debuggable)
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { inferMode, inferTone, type Mode } from "../../../lib/router";
import { inferTags, buildOverlay, type Tone } from "../../../lib/overlays";

export const runtime = "nodejs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL_TEXT = process.env.OPENAI_MODEL_TEXT || "gpt-4.1-mini";
const MODEL_JSON = process.env.OPENAI_MODEL_JSON || "gpt-4o-mini-2024-07-18";

// ---------- tiny helpers ----------
function headersOrError() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key.length < 20) return null;
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}
function fpKernel(text: string) {
  return {
    sha256: crypto.createHash("sha256").update(text).digest("hex"),
    firstLine: (text.split("\n")[0] || "").replace(/^#\s*/, "").trim()
  };
}
function read(rel: string) {
  const full = path.join(process.cwd(), rel);
  return fs.readFileSync(full, "utf-8");
}

// ---------- route ----------
export async function POST(req: NextRequest) {
  try {
    // Body
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: { stage: "request", hint: "Invalid JSON body" } }, { status: 400 });
    }
    const message: string = (body?.message ?? "").toString();
    const modeIn: Mode | undefined = body?.mode;
    const toneIn: Tone | undefined = body?.tone;
    if (!message.trim()) {
      return NextResponse.json({ error: { stage: "request", hint: "message is required" } }, { status: 400 });
    }

    // Headers
    const headers = headersOrError();
    if (!headers) {
      return NextResponse.json({ error: { stage: "env", hint: "OPENAI_API_KEY missing" } }, { status: 500 });
    }

    // Kernel
    let kernel = "";
    try {
      kernel = read("prompts/kernel.md");
    } catch (e: any) {
      return NextResponse.json({ error: { stage: "kernel", hint: "prompts/kernel.md not readable" } }, { status: 500 });
    }
    const { sha256: kernel_hash, firstLine: kernel_version } = fpKernel(kernel);

    // Routing / overlays
    const userMode: Mode = (modeIn || inferMode(message, "text")) as Mode;
    const tone = inferTone(message, toneIn);
    const tags = inferTags(message);
    const overlay = buildOverlay(tone, tags);
    const userContent = overlay ? `${overlay}\n\n---\n\n${message}` : message;

    // TEXT MODE
    if (userMode === "text") {
      let r: Response;
      try {
        r = await fetch(OPENAI_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: MODEL_TEXT,
            input: [
              { role: "system", content: kernel },
              { role: "user", content: userContent }
            ],
            temperature: 0.4,
            max_output_tokens: 600
          })
        });
      } catch (e: any) {
        return NextResponse.json({ error: { stage: "openai_fetch_text", hint: String(e?.message || e) } }, { status: 502 });
      }

      if (!r.ok) {
        const body = await r.text().catch(() => "");
        return NextResponse.json(
          { error: { stage: "openai_text_non_ok", status: r.status, body: body.slice(0, 400) } },
          { status: 502 }
        );
      }

      try {
        const data = await r.json();
        const text =
          data.output_text ??
          data.output?.[0]?.content?.[0]?.text ??
          "";
        return NextResponse.json({
          mode: userMode,
          result: text,
          usage: data.usage,
          meta: { kernel_hash, kernel_version, tone, tags }
        });
      } catch (e: any) {
        return NextResponse.json({ error: { stage: "parse_text_json", hint: String(e?.message || e) } }, { status: 502 });
      }
    }

    // JSON MODE
    const schemaPath = `schemas/${userMode}.json`;
    let schema: any = null;
    try {
      schema = JSON.parse(read(schemaPath));
    } catch {
      return NextResponse.json({ error: { stage: "schema", hint: `Missing or invalid ${schemaPath}` } }, { status: 400 });
    }

    let r: Response;
    try {
      r = await fetch(OPENAI_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: MODEL_JSON,
          input: [
            { role: "system", content: kernel },
            { role: "user", content: userContent }
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: userMode, strict: true, schema }
          },
          temperature: 0.2
        })
      });
    } catch (e: any) {
      return NextResponse.json({ error: { stage: "openai_fetch_json", hint: String(e?.message || e) } }, { status: 502 });
    }

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return NextResponse.json(
        { error: { stage: "openai_json_non_ok", status: r.status, body: body.slice(0, 400) } },
        { status: 502 }
      );
    }

    try {
      const data = await r.json();
      const json = data.output ? data.output[0]?.content?.[0]?.json : undefined;
      return NextResponse.json({
        mode: userMode,
        result: json,
        usage: data.usage,
        meta: { kernel_hash, kernel_version, tone, tags }
      });
    } catch (e: any) {
      return NextResponse.json({ error: { stage: "parse_json_json", hint: String(e?.message || e) } }, { status: 502 });
    }
  } catch (e: any) {
    // last-resort trap
    return NextResponse.json({ error: { stage: "route_fatal", hint: String(e?.message || e) } }, { status: 500 });
  }
}
