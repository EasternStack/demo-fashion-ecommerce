import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const UPLOAD_DIR = path.resolve(process.cwd(), "var/uploads");

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const resolved = path.resolve(UPLOAD_DIR, ...segments);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const body = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
