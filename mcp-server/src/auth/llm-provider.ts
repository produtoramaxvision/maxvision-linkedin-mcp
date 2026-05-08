/**
 * Multi-provider LLM client for optimize_profile (Sprint 2.7).
 *
 * Supports three providers, selected via env var `LLM_PROVIDER`:
 *   - `anthropic`     (default if ANTHROPIC_API_KEY set)
 *   - `openrouter`    (preferred — unified access to Claude, GPT, Gemini, Llama, etc.)
 *   - `openai`        (direct OpenAI API)
 *
 * Auto-fallback order if LLM_PROVIDER is unset:
 *   1. OPENROUTER_API_KEY → openrouter
 *   2. ANTHROPIC_API_KEY  → anthropic
 *   3. OPENAI_API_KEY     → openai
 *
 * Defaults:
 *   - Anthropic:  claude-haiku-4-5-20251001
 *   - OpenRouter: anthropic/claude-haiku-4.5 (override via LLM_MODEL env)
 *   - OpenAI:     gpt-4o-mini
 */
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

type Provider = 'anthropic' | 'openrouter' | 'openai';

interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  endpoint: string;
}

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openrouter: 'anthropic/claude-haiku-4.5',
  openai: 'gpt-4o-mini',
};

const ENDPOINTS: Record<Provider, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
};

function resolveProvider(): ProviderConfig {
  const explicit = process.env['LLM_PROVIDER']?.toLowerCase();
  const userModel = process.env['LLM_MODEL'];

  // Explicit override.
  if (explicit === 'anthropic') {
    const key = process.env['ANTHROPIC_API_KEY'];
    if (!key) throw new AppError('CONFIG_FAIL', 'LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY unset');
    return {
      provider: 'anthropic',
      apiKey: key,
      model: userModel ?? DEFAULT_MODELS.anthropic,
      endpoint: ENDPOINTS.anthropic,
    };
  }
  if (explicit === 'openrouter') {
    const key = process.env['OPENROUTER_API_KEY'];
    if (!key) throw new AppError('CONFIG_FAIL', 'LLM_PROVIDER=openrouter but OPENROUTER_API_KEY unset');
    return {
      provider: 'openrouter',
      apiKey: key,
      model: userModel ?? DEFAULT_MODELS.openrouter,
      endpoint: ENDPOINTS.openrouter,
    };
  }
  if (explicit === 'openai') {
    const key = process.env['OPENAI_API_KEY'];
    if (!key) throw new AppError('CONFIG_FAIL', 'LLM_PROVIDER=openai but OPENAI_API_KEY unset');
    return {
      provider: 'openai',
      apiKey: key,
      model: userModel ?? DEFAULT_MODELS.openai,
      endpoint: ENDPOINTS.openai,
    };
  }

  // Auto-resolve. OpenRouter preferred (single key, all providers).
  const orKey = process.env['OPENROUTER_API_KEY'];
  if (orKey) {
    return {
      provider: 'openrouter',
      apiKey: orKey,
      model: userModel ?? DEFAULT_MODELS.openrouter,
      endpoint: ENDPOINTS.openrouter,
    };
  }
  const anKey = process.env['ANTHROPIC_API_KEY'];
  if (anKey) {
    return {
      provider: 'anthropic',
      apiKey: anKey,
      model: userModel ?? DEFAULT_MODELS.anthropic,
      endpoint: ENDPOINTS.anthropic,
    };
  }
  const oaKey = process.env['OPENAI_API_KEY'];
  if (oaKey) {
    return {
      provider: 'openai',
      apiKey: oaKey,
      model: userModel ?? DEFAULT_MODELS.openai,
      endpoint: ENDPOINTS.openai,
    };
  }
  throw new AppError(
    'CONFIG_FAIL',
    'No LLM provider configured — set OPENROUTER_API_KEY (preferred), ANTHROPIC_API_KEY, or OPENAI_API_KEY env on the MCP server',
  );
}

export interface LlmInvokeArgs {
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Invoke the configured LLM provider with a single user message + optional
 * system prompt. Returns the text content of the assistant reply.
 *
 * Uniform interface across providers: callers use the same shape regardless
 * of which provider answers. Error envelope is normalized to AppError
 * (EXTERNAL_API_FAIL on non-2xx, CONFIG_FAIL on missing creds).
 */
export async function invokeLlm(args: LlmInvokeArgs): Promise<string> {
  const cfg = resolveProvider();
  const maxTokens = args.maxTokens ?? 4096;
  const temperature = args.temperature ?? 0.4;

  let body: string;
  let headers: Record<string, string>;

  if (cfg.provider === 'anthropic') {
    body = JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      temperature,
      system: args.systemPrompt,
      messages: [{ role: 'user', content: args.userPrompt }],
    });
    headers = {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    };
  } else {
    // OpenAI-compatible (OpenRouter + OpenAI share schema).
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (args.systemPrompt) messages.push({ role: 'system', content: args.systemPrompt });
    messages.push({ role: 'user', content: args.userPrompt });
    body = JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      temperature,
      messages,
    });
    headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey}`,
    };
    if (cfg.provider === 'openrouter') {
      // OpenRouter rankings — optional but recommended.
      headers['HTTP-Referer'] = 'https://linkedin.maxvision.com.br';
      headers['X-Title'] = 'MaxVision LinkedIn Suite';
    }
  }

  logger.info(
    { provider: cfg.provider, model: cfg.model, maxTokens },
    'invoke_llm',
  );

  const res = await fetch(cfg.endpoint, { method: 'POST', headers, body });
  if (!res.ok) {
    const errBody = await res.text();
    throw new AppError(
      'EXTERNAL_API_FAIL',
      `${cfg.provider} API ${res.status}: ${errBody.slice(0, 300)}`,
      { provider: cfg.provider, status: res.status },
    );
  }

  const json = (await res.json()) as Record<string, unknown>;
  if (cfg.provider === 'anthropic') {
    const content = json['content'] as Array<{ type: string; text?: string }> | undefined;
    return content?.find((c) => c.type === 'text')?.text ?? '';
  }
  // OpenAI-compatible response shape.
  const choices = json['choices'] as Array<{ message?: { content?: string } }> | undefined;
  return choices?.[0]?.message?.content ?? '';
}
