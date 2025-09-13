// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Use relative imports so this works without path aliases.
// If you created these files exactly as suggested, they live at /lib/*.ts
import { inferMode, type Mode } from "../../../lib/router";
import { inferTone, inferTags, buildOverlay, type Tone } from "../../../lib/overlays";

export const runtime = "nodejs"; // ensure Node runtime on Vercel

// ---- Config ----
const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL_TEXT = process.env.OPENAI_MODEL_TEXT || "gpt-4.1-mini";
const MODEL_JSON = process.env.OPENAI_MODEL_JSON || "gpt-4o-mini-2024-07-18";

// ---- Helpers ----
function getHeadersOrError() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key.length < 20) return null;
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function readText(relPath: string) {
  const full = path.join(process.cwd(), relPath);
  return fs.readFileSync(full, "utf-8");
}

function tryReadJSON(relPath: string) {
  const full = path.join(process.cwd(), relPath);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf-8"));
}

function fingerprintKernel(text: string) {
  const sha256 = crypto.createHash("sha256").update(text).digest("hex");
  const firstLine = (text.split("\n")[0] || "").replace(/^#\s*/, "").trim();
  return { sha256, firstLine };
}

// ---- Route ----
export async function POST(req: NextRequest) {
  try {
    const headers = getHeadersOrError();
    if (!headers) {
      return NextResponse.json({ error: "Server is missing OPENAI_API_KEY" }, { status: 500 });
    }

    // Parse request body safely
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const message: string = (body?.message ?? "").toString();
    const modeIn: Mode | undefined = body?.mode;
    const toneIn: Tone | undefined = body?.tone; // optional UI-provided tone

    if (!message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Read the stable kernel (for tone/guardrails). Keep this file byte-for-byte stable for caching.
    const kernel = readText("prompts/kernel.md");
    const { sha256: kernel_hash, firstLine: kernel_version } = fingerprintKernel(kernel);

    // Routing: decide mode + tone + tags (cheap, local)
    const userMode: Mode = (modeIn || inferMode(message, "text")) as Mode;
    const tone = inferTone(message, toneIn);
    const tags = inferTags(message);

    // Build the tiny overlay (≤ ~150 tokens) and prepend to user content
    const overlay = buildOverlay(tone, tags);
    const userContent = overlay ? `${overlay}\n\n---\n\n${message}` : message;

    // TEXT MODE (no schema)
    if (userMode === "text") {
      const r = await fetch(OPENAI_URL, {
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

      if (!r.ok) {
        const errText = await r.text().catch(() => "OpenAI error");
        console.error("OpenAI TEXT failed:", errText);
        return NextResponse.json(
          { error: "We hit a hiccup talking to the AI. Please try again." },
          { status: 502 }
        );
      }

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
    }

    // JSON MODES (strict one-shot structured outputs)
    const schemaPath = `schemas/${userMode}.json`;
    const schema = tryReadJSON(schemaPath);
    if (!schema) {
      return NextResponse.json(
        { error: `Schema not found for mode: ${userMode}. Expected ${schemaPath}` },
        { status: 400 }
      );
    }

    const r = await fetch(OPENAI_URL, {
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

    if (!r.ok) {
      const errText = await r.text().catch(() => "OpenAI error");
      console.error("OpenAI JSON failed:", errText);
      return NextResponse.json(
        { error: "We hit a hiccup talking to the AI. Please try again." },
        { status: 502 }
      );
    }

    const data = await r.json();
    // With Structured Outputs, JSON comes back parsed under content[0].json
    const json = data.output ? data.output[0]?.content?.[0]?.json : undefined;

    return NextResponse.json({
      mode: userMode,
      result: json,
      usage: data.usage,
      meta: { kernel_hash, kernel_version, tone, tags }
    });

  } catch (e: any) {
    console.error("Route fatal error:", e?.message || e);
    return NextResponse.json(
      { error: "Unexpected server error. Please try again." },
      { status: 500 }
    );
  }
}
