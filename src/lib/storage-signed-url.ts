import type { SupabaseClient } from "@supabase/supabase-js";

type CacheEntry = {
  url: string;
  expiresAt: number;
};

/** Reuse signed URLs across polls; URLs are minted for 1h, refresh at ~50m. */
const CACHE_TTL_MS = 50 * 60 * 1000;
const SIGNED_URL_SECONDS = 60 * 60;

const cache = new Map<string, CacheEntry>();

function cacheKey(bucket: string, path: string) {
  return `${bucket}:${path}`;
}

export async function getSignedStorageUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<string | null> {
  const key = cacheKey(bucket, path);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.url;
  }

  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_SECONDS);

  const url = data?.signedUrl ?? null;
  if (url) {
    cache.set(key, { url, expiresAt: Date.now() + CACHE_TTL_MS });
  } else {
    cache.delete(key);
  }
  return url;
}

export async function getSignedStorageUrls(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  await Promise.all(
    paths.map(async (path) => {
      results.set(path, await getSignedStorageUrl(supabase, bucket, path));
    }),
  );
  return results;
}
