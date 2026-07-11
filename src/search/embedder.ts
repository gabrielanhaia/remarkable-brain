/**
 * Local text embedder for semantic search. Every implementation runs fully on-device — no network
 * call is ever made at query time. The default implementation is backed by transformers.js and is
 * an OPTIONAL dependency: if it isn't installed, `createEmbedder` returns null and callers fall
 * back to keyword search.
 */
export interface Embedder {
  /** Embedding dimensionality (e.g. 384 for all-MiniLM-L6-v2). */
  readonly dim: number;
  /** Embed one or more texts into L2-normalized vectors. */
  embed(texts: string[]): Promise<Float32Array[]>;
}

/** Cosine similarity of two vectors. With L2-normalized inputs this is just the dot product. */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Default model: small, fast, 384-dim, quantized ONNX. Downloaded once and cached on disk. */
export const DEFAULT_EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';

/**
 * Create a local embedder, or return null if the optional `@xenova/transformers` dependency is not
 * installed. The model is fetched once (into the transformers.js cache) and then runs offline. This
 * function is lazy — importing this module does not load the model or the dependency.
 */
export async function createEmbedder(model = DEFAULT_EMBED_MODEL): Promise<Embedder | null> {
  let tf: { pipeline: (task: string, model: string, opts?: unknown) => Promise<unknown> };
  try {
    // Optional dependency: absent → semantic search is simply unavailable.
    tf = (await import('@xenova/transformers' as string)) as typeof tf;
  } catch {
    return null;
  }
  const extractor = (await tf.pipeline('feature-extraction', model, { quantized: true })) as (
    text: string,
    opts: { pooling: 'mean'; normalize: boolean }
  ) => Promise<{ data: ArrayLike<number> }>;

  let dim = 384;
  return {
    get dim() {
      return dim;
    },
    async embed(texts: string[]): Promise<Float32Array[]> {
      const out: Float32Array[] = [];
      for (const t of texts) {
        // Cap very long pages so a single note can't blow up inference time/memory.
        const res = await extractor(t.slice(0, 8000), { pooling: 'mean', normalize: true });
        const v = Float32Array.from(res.data);
        dim = v.length;
        out.push(v);
      }
      return out;
    },
  };
}
