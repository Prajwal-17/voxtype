import { parseUsage, type TokenUsage } from '../analytics/analytics.costs';
import { ApiError } from '../../shared/errors/api-error';
import { CLEANUP_SYSTEM_PROMPT } from '../../constants/prompts';

const TRANSCRIPTION_UNAVAILABLE = 'Could not start transcription. Try again.';
const OPENCODE_CHAT_URL = 'https://opencode.ai/inference/go/openai/v1/chat/completions';
// OpenCode Go exposes this ID as "DeepSeek V4.1 Flash 1017"
// (canonical deepseek/deepseek-v4.1-flash-1017). Reasoning is disabled per request.
const CLEANUP_MODEL = 'deepseek-v4.1-flash';

/** Provider errors are logged (never the key) so a misconfigured secret is diagnosable. */
async function logDeepgramFailure(reason: string, response?: Response) {
  let detail = '';
  if (response) {
    detail = await response
      .clone()
      .text()
      .catch(() => '');
  }
  console.error(
    JSON.stringify({
      level: 'error',
      scope: 'deepgram.grant',
      reason,
      status: response?.status,
      detail: detail.slice(0, 500),
    }),
  );
}

export async function grantDeepgramToken(apiKey: string, fetcher: typeof fetch = fetch) {
  if (!apiKey.trim()) {
    await logDeepgramFailure('missing_api_key');
    throw new ApiError(502, 'transcription_unavailable', TRANSCRIPTION_UNAVAILABLE);
  }
  const response = await fetcher('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl_seconds: 600 }),
  });
  if (!response.ok) {
    await logDeepgramFailure('provider_rejected', response);
    throw new ApiError(502, 'transcription_unavailable', TRANSCRIPTION_UNAVAILABLE);
  }
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('access_token' in body) ||
    typeof body.access_token !== 'string' ||
    !('expires_in' in body) ||
    typeof body.expires_in !== 'number'
  ) {
    throw new ApiError(
      502,
      'transcription_unavailable',
      'Could not start transcription. Try again.',
    );
  }
  return { token: body.access_token, expiresIn: body.expires_in };
}

/** Cleanup is optional: any provider error preserves the original speech text. */
export async function cleanTranscript(
  originalText: string,
  apiKey: string,
  sessionId = 'voxtype-cleanup',
  fetcher: typeof fetch = fetch,
): Promise<{ text: string; cleaned: boolean; usage?: TokenUsage | null; metered?: boolean }> {
  if (!originalText.trim()) return { text: originalText, cleaned: false };
  if (!apiKey?.trim()) {
    logCleanupFailure('missing_api_key');
    return { text: originalText, cleaned: false };
  }
  // Long dictations need headroom: cleaned output runs ~input length, so
  // budget ~2x input tokens plus margin instead of a fixed 1024 cap.
  const maxTokens = Math.min(8000, Math.max(1024, Math.ceil(originalText.length / 2) + 256));
  try {
    const response = await fetcher(OPENCODE_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'VoxType/1.0',
        'x-opencode-session': sessionId,
      },
      body: JSON.stringify({
        model: CLEANUP_MODEL,
        stream: false,
        temperature: 0,
        reasoning_effort: 'none',
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: CLEANUP_SYSTEM_PROMPT },
          { role: 'user', content: originalText },
        ],
      }),
    });
    if (!response.ok) {
      logCleanupFailure('provider_rejected', response);
      return { text: originalText, cleaned: false };
    }
    const body: unknown = await response.json();
    const usage = parseUsage((body as { usage?: unknown })?.usage);
    const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
      ?.message?.content;
    if (typeof content !== 'string' || !content.trim())
      return { text: originalText, cleaned: false, usage, metered: true };
    return { text: content.trim(), cleaned: true, usage, metered: true };
  } catch {
    return { text: originalText, cleaned: false };
  }
}

/** OpenCode errors are logged (never the key or transcript) so a misconfigured secret is diagnosable. */
function logCleanupFailure(reason: string, response?: Response) {
  console.error(
    JSON.stringify({
      level: 'error',
      scope: 'opencode.cleanup',
      reason,
      status: response?.status,
    }),
  );
}
