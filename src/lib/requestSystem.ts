/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface FallbackOptions {
  enabled?: boolean;
  modes?: ('cached_response' | 'partial_feature_merge' | 'ai_text_recovery' | 'template_fallback')[];
  aiTextRecovery?: {
    enabled?: boolean;
    style?: string;
    source?: string;
    recoveryFn?: (context: any) => Promise<any>;
  };
  templateFallback?: {
    enabled?: boolean;
    format?: string;
    context?: any;
  };
}

interface RequestOptions {
  cacheKey?: string;
  ttl?: number;
  maxRetries?: number;
  timeout?: number;
  fallback?: FallbackOptions;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const pendingRequests = new Map<string, Promise<any>>();

// Throttle state
let requestHistory: number[] = [];
const THROTTLE_LIMIT = 3;
const THROTTLE_WINDOW = 10000; // 10s

export async function executeWithSystem<T>(
  fn: () => Promise<T>,
  options: RequestOptions = {}
): Promise<T> {
  const {
    cacheKey,
    ttl = 90000, // 90s
    maxRetries = 3,
    timeout = 60000, // 60s
    fallback = { 
      enabled: true, 
      modes: ['cached_response', 'template_fallback'],
      aiTextRecovery: { enabled: true, style: 'informative_concise' },
      templateFallback: { enabled: true }
    }
  } = options;

  // 1. Performance Optimization: Cache (Instant return if valid)
  if (cacheKey && cache.has(cacheKey)) {
    const entry = cache.get(cacheKey)!;
    if (Date.now() - entry.timestamp < ttl) {
      console.log(`[RequestSystem] Cache hit for ${cacheKey}`);
      return entry.data;
    }
  }

  // 2. Safety Control: Prevent Duplicate Calls
  if (cacheKey && pendingRequests.has(cacheKey)) {
    console.log(`[RequestSystem] Duplicate request detected for ${cacheKey}, joining existing...`);
    return pendingRequests.get(cacheKey)!;
  }

  const requestPromise = (async () => {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 3. Input Control: Throttle
        checkThrottle();

        // 4. Safety Control: Timeout
        const result = await withTimeout(fn(), timeout);

        // Success! Cache and return
        if (cacheKey) {
          cache.set(cacheKey, { data: result, timestamp: Date.now() });
          pendingRequests.delete(cacheKey);
        }
        return result;

      } catch (error: any) {
        lastError = error;
        
        // Logging
        if (attempt === maxRetries) {
          console.error(`[RequestSystem] Final attempt failed:`, error.message);
        } else {
          console.warn(`[RequestSystem] Attempt ${attempt + 1} failed:`, error.message);
        }

        // Retry Rules
        if (shouldRetry(error, attempt, maxRetries)) {
          const delay = calculateBackoff(attempt);
          console.log(`[RequestSystem] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        break;
      }
    }

    if (cacheKey) pendingRequests.delete(cacheKey);

    // 5. Fallback System: Anti-Gagal Total
    if (fallback.enabled) {
      console.log(`[RequestSystem] Entering fallback mode for ${cacheKey || 'anonymous request'}`);
      
      for (const mode of fallback.modes || []) {
        // Mode 1: Cached Response (Stale data)
        if (mode === 'cached_response' && cacheKey && cache.has(cacheKey)) {
          console.log(`[RequestSystem] Fallback: Using stale cache for ${cacheKey}`);
          return cache.get(cacheKey)!.data;
        }

        // Mode 2: AI Text Recovery
        if (mode === 'ai_text_recovery' && fallback.aiTextRecovery?.enabled && fallback.aiTextRecovery.recoveryFn) {
          try {
            console.log(`[RequestSystem] Fallback: Attempting AI text recovery...`);
            return await fallback.aiTextRecovery.recoveryFn(fallback.templateFallback?.context);
          } catch (e) {
            console.warn(`[RequestSystem] AI recovery failed:`, e);
          }
        }

        // Mode 3: Template Fallback
        if (mode === 'template_fallback' && fallback.templateFallback?.enabled) {
          console.log(`[RequestSystem] Fallback: Using template fallback`);
          const context = fallback.templateFallback.context || {};
          const format = fallback.templateFallback.format || `
Judul: {context_title}

Ringkasan:
{partial_result_or_explanation}

Catatan:
Sistem sedang dalam mode pemulihan, hasil mungkin tidak lengkap.
          `.trim();

          return formatTemplate(format, context) as unknown as T;
        }
      }
    }

    throw lastError;
  })();

  if (cacheKey) pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

function formatTemplate(template: string, context: any): string {
  return template.replace(/{(\w+)}/g, (match, key) => {
    return context[key] !== undefined ? context[key] : match;
  });
}

function checkThrottle() {
  const now = Date.now();
  requestHistory = requestHistory.filter(t => now - t < THROTTLE_WINDOW);
  
  if (requestHistory.length >= THROTTLE_LIMIT) {
    throw new Error('Rate limit exceeded. Please wait a moment.');
  }
  
  requestHistory.push(now);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Request Timeout')), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function shouldRetry(error: any, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) return false;

  const msg = error.message?.toLowerCase() || '';
  
  // on_timeout: 1
  if (msg.includes('timeout')) return true;
  
  // on_5xx_error: 2
  if (msg.includes('500') || msg.includes('server error')) return true;
  
  // on_rate_limit_429: 2
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) return true;

  // on_4xx_error: 0 (don't retry client errors like 400, 401, 403, 404)
  return false;
}

function calculateBackoff(attempt: number): number {
  const baseDelay = 800;
  const maxDelay = 6000;
  // Exponential backoff with jitter
  const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));
  const jitter = Math.random() * 200;
  return delay + jitter;
}

// Fallback: Offline Queue (Simplified for demo)
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[RequestSystem] Back online. System ready.');
  });
}
