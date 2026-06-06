import { inflateRawSync } from "zlib";
import { NextResponse } from "next/server";
import { requireAllowedUser } from "@/lib/auth/api";
import { parseTermsFromText, type ExtractMode } from "@/lib/text/list-parser";
import { isUsableExtractedText } from "@/lib/text/word-extract";

const maxFileBytes = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;

  const { fileName, mimeType, base64, mode } = await request.json();
  if (!base64 || typeof base64 !== "string") {
    return NextResponse.json({ error: "base64 is required" }, { status: 400 });
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > maxFileBytes) {
    return NextResponse.json({ error: "文件太大，请上传 8MB 以内的文件。" }, { status: 413 });
  }

  const name = typeof fileName === "string" ? fileName.toLowerCase() : "";
  const type = typeof mimeType === "string" ? mimeType : "";
  let text = "";

  if (type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(name)) {
    return NextResponse.json(
      { error: "当前建议上传 Word、txt、csv 或可复制文字 PDF。扫描版 PDF / 图片识别可能不准确，暂不推荐用于词表导入。" },
      { status: 400 }
    );
  }

  if (name.endsWith(".docx") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    text = extractDocxText(buffer);
  } else if (name.endsWith(".pdf") || mimeType === "application/pdf") {
    text = extractPdfText(buffer);
    if (!isUsableExtractedText(text)) {
      return NextResponse.json({
        success: false,
        needsOcr: true,
        requiresOcr: true,
        fileType: "pdf",
        words: [],
        rawTextPreview: "",
        message: "这个 PDF 可能是扫描版，目前不建议直接导入。请上传 Word、txt、csv，或者使用可复制文字 PDF。",
        ocrSupported: false,
        error: "这个 PDF 可能是扫描版，目前不建议直接导入。请上传 Word、txt、csv，或者使用可复制文字 PDF。"
      });
    }
  } else {
    text = buffer.toString("utf8");
  }

  const extractMode = normalizeMode(mode, name);
  const words = parseTermsFromText(text, extractMode);
  return NextResponse.json({
    success: true,
    mode: extractMode,
    words,
    rawTextLength: text.length,
    rawTextPreview: text.slice(0, 1200)
  });
}

function normalizeMode(mode: unknown, fileName: string): ExtractMode {
  if (mode === "smart" || mode === "vocab" || mode === "table" || mode === "fulltext") return mode;
  return fileName.endsWith(".csv") ? "smart" : "smart";
}

function extractDocxText(buffer: Buffer) {
  const entries = unzipEntries(buffer);
  const documentXml = entries.get("word/document.xml");
  if (!documentXml) return "";
  return documentXml
    .toString("utf8")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function unzipEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;

  while (offset + 30 < buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const fileName = buffer.slice(nameStart, nameStart + fileNameLength).toString("utf8");
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);

    if (compressedSize > 0 && uncompressedSize > 0) {
      entries.set(fileName, compression === 8 ? inflateRawSync(compressed) : compressed);
    }

    offset = dataStart + compressedSize;
  }

  return entries;
}

function extractPdfText(buffer: Buffer) {
  const text = buffer.toString("latin1");
  const chunks = Array.from(text.matchAll(/\(([^()]{2,})\)/g)).map((match) => match[1]);
  return chunks
    .join(" ")
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1");
}
