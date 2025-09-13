import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const runtime = "nodejs";

function exists(p: string) {
  try { fs.accessSync(p, fs.constants.R_OK); return true; } catch { return false; }
}

export async function GET() {
  const base = process.cwd();
  const out: any = {};

  // env
  const k = process.env.OPENAI_API_KEY || "";
  out.env = {
    has_key: k.length > 20,
    key_preview: k ? `${k.slice(0,7)}…${k.slice(-4)}` : null,
    text_model: process.env.OPENAI_MODEL_TEXT || null,
    json_model: process.env.OPENAI_MODEL_JSON || null
  };

  // kernel
  const kernelPath = path.join(base, "prompts", "kernel.md");
  out.kernel = { path: "prompts/kernel.md", exists: exists(kernelPath) };
  if (out.kernel.exists) {
    const text = fs.readFileSync(kernelPath, "utf-8");
    out.kernel.bytes = Buffer.byteLength(text, "utf-8");
    out.kernel.sha256 = crypto.createHash("sha256").update(text).digest("hex");
    out.kernel.first_line = (text.split("\n")[0] || "").trim().slice(0, 160);
  }

  // schemas
  const names = ["support_plan", "social_story", "routine_plan"];
  out.schemas = {};
  for (const n of names) {
    const p = path.join(base, "schemas", `${n}.json`);
    const item: any = { path: `schemas/${n}.json`, exists: exists(p) };
    if (item.exists) {
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf-8"));
        item.valid_json = true;
        item.top_keys = Object.keys(j).slice(0, 6);
      } catch {
        item.valid_json = false;
      }
    }
    out.schemas[n] = item;
  }

  return NextResponse.json(out);
}
