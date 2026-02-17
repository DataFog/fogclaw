import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@xenova/transformers";

import type { Entity } from "../types.js";
import { canonicalType } from "../types.js";

const DEFAULT_NER_LABELS = [
  "person",
  "organization",
  "location",
  "address",
  "date of birth",
  "medical record number",
  "account number",
  "passport number",
];

const GLINER_MODEL_FILES = [
  "onnx/model_q4f16.onnx",
  "onnx/model_q4.onnx",
  "onnx/model_bnb4.onnx",
  "onnx/model_int8.onnx",
  "onnx/model_uint8.onnx",
  "onnx/model_quantized.onnx",
  "onnx/model_fp16.onnx",
  "onnx/model.onnx",
];

const MODEL_DOWNLOAD_TIMEOUT_MS = 120_000;

function isLikelyLocalPath(modelPath: string): boolean {
  const trimmed = modelPath.trim();
  if (!trimmed) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  const hasExtension = [".onnx", ".ort", ".bin"].some((ext) => lower.endsWith(ext));
  if (hasExtension) {
    return true;
  }

  if (trimmed.startsWith(".") || path.isAbsolute(trimmed)) {
    return true;
  }

  return false;
}

function toAbsolutePath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function getModelCacheDir(): string {
  return env.localModelPath ?? path.join(process.cwd(), ".cache");
}

function sanitizeModelReference(modelPath: string): string {
  return modelPath.trim();
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadModelIfNeeded(modelRepo: string, filename: string): Promise<string> {
  const cacheDir = getModelCacheDir();
  const localPath = path.join(cacheDir, modelRepo, filename);

  if (await fileExists(localPath)) {
    return localPath;
  }

  const url = `https://huggingface.co/${modelRepo}/resolve/main/${filename}`;
  const headers = new Headers();
  const token = process.env.HF_TOKEN ?? process.env.HF_ACCESS_TOKEN;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Unable to download model artifact: ${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, bytes);

    return localPath;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Model download timed out after ${MODEL_DOWNLOAD_TIMEOUT_MS}ms`);
    }

    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveModelPath(modelPath: string): Promise<string> {
  const sanitized = sanitizeModelReference(modelPath);
  if (!sanitized) {
    throw new Error("Model path is empty");
  }

  if (isLikelyLocalPath(sanitized)) {
    const absolutePath = toAbsolutePath(sanitized);
    if (!(await fileExists(absolutePath))) {
      throw new Error(`Local GLiNER model file not found at: ${absolutePath}`);
    }

    return absolutePath;
  }

  const candidates = GLINER_MODEL_FILES;
  let lastError: Error | undefined;

  for (const filename of candidates) {
    const localPath = path.join(getModelCacheDir(), sanitized, filename);
    if (await fileExists(localPath)) {
      return localPath;
    }
  }

  for (const filename of candidates) {
    try {
      return await downloadModelIfNeeded(sanitized, filename);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `Failed to resolve GLiNER model "${sanitized}". Tried ${candidates.join(", ")}: ${
      lastError?.message ?? "unknown"
    }`,
  );
}

export class GlinerEngine {
  private model: any = null;
  private modelPath: string;
  private threshold: number;
  private customLabels: string[] = [];
  private initialized = false;

  constructor(modelPath: string, threshold: number = 0.5) {
    this.modelPath = modelPath;
    this.threshold = threshold;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const resolvedModelPath = await resolveModelPath(this.modelPath);
      const glinerModule = await import("gliner/node").catch(async () => import("gliner"));
      const { Gliner } = glinerModule;
      this.model = new Gliner({
        tokenizerPath: this.modelPath,
        onnxSettings: {
          modelPath: resolvedModelPath,
          executionProvider: "cpu",
        },
        maxWidth: 12,
        modelType: "span-level",
      });
      await this.model.initialize();
      this.initialized = true;
    } catch (err) {
      throw new Error(
        `Failed to initialize GLiNER model "${this.modelPath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  setCustomLabels(labels: string[]): void {
    this.customLabels = labels;
  }

  async scan(text: string, extraLabels?: string[]): Promise<Entity[]> {
    if (!text) return [];
    if (!this.model) {
      throw new Error("GLiNER engine not initialized. Call initialize() first.");
    }

    const labels = [
      ...DEFAULT_NER_LABELS,
      ...this.customLabels,
      ...(extraLabels ?? []),
    ];

    // Deduplicate labels
    const uniqueLabels = [...new Set(labels)];

    const rawResults = await this.model.inference({
      texts: [text],
      entities: uniqueLabels,
      flatNer: false,
      threshold: this.threshold,
    });
    const flatResults = Array.isArray(rawResults) ? rawResults.flat() : [];

    return flatResults.map(
      (
        r: {
          spanText?: string;
          text: string;
          label: string;
          score: number;
          start: number;
          end: number;
        },
      ) => ({
        text: r.spanText ?? r.text,
        label: canonicalType(r.label),
        start: r.start,
        end: r.end,
        confidence: r.score,
        source: "gliner" as const,
      }),
    );
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}
