/**
 * tools/optimize_profile — Sprint 2 profile audit via Claude.
 *
 * Takes a profile (text supplied OR scraped via get_profile) plus a target
 * role, ships them to Anthropic Messages API, and returns structured
 * recommendations: gaps, headline rewrites, summary rewrites, missing skills.
 *
 * Cost-conscious: capped 4096 output tokens, claude-haiku-4-5 for low cost.
 * If `ANTHROPIC_API_KEY` env is missing, fails fast with a clear error.
 */
import { withInstrumentation } from './_base.js';
import { OptimizeProfileInputSchema, type OptimizeProfileInput } from './schemas.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

interface OptimizeProfileOutput {
  targetRole: string;
  summaryAnalysis: string;
  headlineSuggestion: string;
  gaps: string[];
  recommendedSkills: string[];
  rewriteAbout: string;
}

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

function buildPrompt(targetRole: string, profileText: string): string {
  return [
    `You are a senior LinkedIn profile optimizer. Analyze the following profile`,
    `against the target role "${targetRole}". Return a single valid JSON object`,
    `with EXACTLY these keys (no markdown fences, no preamble):`,
    `{`,
    `  "summaryAnalysis": "<paragraph: how well the current profile signals fit>",`,
    `  "headlineSuggestion": "<a 110-char rewritten headline>",`,
    `  "gaps": ["<gap 1>", "<gap 2>", ...],`,
    `  "recommendedSkills": ["<skill 1>", "<skill 2>", ...],`,
    `  "rewriteAbout": "<rewritten About section, 800-1500 chars, plain text>"`,
    `}`,
    ``,
    `Target role: ${targetRole}`,
    ``,
    `Profile:`,
    profileText,
  ].join('\n');
}

export const optimizeProfile = withInstrumentation<OptimizeProfileInput, OptimizeProfileOutput>({
  name: 'optimize_profile',
  description:
    'Analyze a LinkedIn profile against a target role using Claude (Sprint 2). Requires ANTHROPIC_API_KEY env on the MCP server.',
  inputSchema: OptimizeProfileInputSchema,
  handler: async ({ input, accountId }) => {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw new AppError(
        'CONFIG_FAIL',
        'ANTHROPIC_API_KEY env var not set on MCP server',
        { tool: 'optimize_profile' },
      );
    }

    const profileText = input.profileText;
    if (!profileText) {
      throw new AppError(
        'VALIDATION_FAIL',
        'Either profileText must be supplied OR Sprint 2.5 GraphQL profile fetch must be wired (TBD).',
        { tool: 'optimize_profile' },
      );
    }

    logger.info(
      { accountId, targetRole: input.targetRole, len: profileText.length },
      'optimize_profile invoked',
    );

    const body = {
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(input.targetRole, profileText) }],
    };

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new AppError(
        'EXTERNAL_API_FAIL',
        `Anthropic API ${res.status}: ${errBody.slice(0, 300)}`,
        { status: res.status },
      );
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = json.content?.find((c) => c.type === 'text')?.text || '';

    let parsed: Record<string, unknown>;
    try {
      // The model is instructed to return raw JSON, but defensively strip
      // markdown fences if they appear.
      const stripped = text
        .replace(/^```(?:json)?/, '')
        .replace(/```\s*$/, '')
        .trim();
      parsed = JSON.parse(stripped);
    } catch (err) {
      throw new AppError(
        'EXTERNAL_API_FAIL',
        `Anthropic response was not valid JSON: ${(err as Error).message}`,
        { responseHead: text.slice(0, 200) },
      );
    }

    return {
      targetRole: input.targetRole,
      summaryAnalysis: String(parsed['summaryAnalysis'] ?? ''),
      headlineSuggestion: String(parsed['headlineSuggestion'] ?? ''),
      gaps: Array.isArray(parsed['gaps'])
        ? (parsed['gaps'] as unknown[]).map(String)
        : [],
      recommendedSkills: Array.isArray(parsed['recommendedSkills'])
        ? (parsed['recommendedSkills'] as unknown[]).map(String)
        : [],
      rewriteAbout: String(parsed['rewriteAbout'] ?? ''),
    };
  },
});
