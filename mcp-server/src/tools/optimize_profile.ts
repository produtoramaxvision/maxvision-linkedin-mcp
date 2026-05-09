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
import { invokeLlm } from '../auth/llm-provider.js';
import { tavilyExtract } from '../browser/content-extract.js';
import { scrapeProfile, type ProfileData } from '../scrapers/linkedin-profile.js';
import { logger } from '../logger.js';
import { AppError } from '../errors.js';

/**
 * Detects LinkedIn anti-scrape page that Tavily returns for low-visibility
 * profiles (renders multilingual "Page not found" instead of public preview).
 * Bill Gates (30M followers) → public preview liberado. Max Müller (10
 * conexões) → 404 multilingual. Pattern check covers EN/PT/ES/AR/CS markers
 * present in LinkedIn's i18n 404 page.
 */
function isLinkedInAntiScrapePage(text: string): boolean {
  const head = text.slice(0, 2000);
  return (
    /Page not found/i.test(head) ||
    /Stránka nenalezena/i.test(head) ||
    /Página não encontrada/i.test(head) ||
    /Página no encontrada/i.test(head) ||
    /لم يتم العثور على الصفحة/.test(head) ||
    /Siden blev ikke fundet/i.test(head) ||
    (/# LinkedIn/i.test(head) && /選擇語言/.test(head)) // multi-lang lang switcher header
  );
}

/**
 * Render Apify ProfileData as plain text suitable for LLM analysis.
 * Same shape across providers — keeps optimize_profile prompt stable.
 */
function profileDataToText(p: ProfileData): string {
  const lines: string[] = [
    p.fullName,
    p.headline,
    `Location: ${p.location}`,
  ];
  if (p.currentCompany || p.currentRole) {
    lines.push(`Current: ${p.currentRole ?? ''} @ ${p.currentCompany ?? ''}`);
  }
  if (p.summary) lines.push('', 'Summary:', p.summary);
  if (p.experience.length > 0) {
    lines.push('', 'Experience:');
    for (const e of p.experience) {
      lines.push(`- ${e.title} @ ${e.company} (${e.startDate}-${e.endDate}) ${e.location ?? ''}`);
      if (e.description) lines.push(`  ${e.description}`);
    }
  }
  if (p.education.length > 0) {
    lines.push('', 'Education:');
    for (const ed of p.education) {
      lines.push(`- ${ed.school}${ed.startYear ? ` (${ed.startYear}-${ed.endYear})` : ''}`);
    }
  }
  if (p.skills.length > 0) {
    lines.push('', 'Skills: ' + p.skills.slice(0, 30).join(', '));
  }
  return lines.join('\n');
}

interface OptimizeProfileOutput {
  targetRole: string;
  summaryAnalysis: string;
  headlineSuggestion: string;
  gaps: string[];
  recommendedSkills: string[];
  rewriteAbout: string;
}

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
    // Resolve profile text. Priority:
    //   1. input.profileText (manual paste — fastest, free)
    //   2. input.profileUrl + TAVILY_API_KEY → Tavily Extract (public preview)
    //      - if Tavily returns LinkedIn anti-scrape 404 page, fall through
    //   3. input.profileUrl + Apify (get_profile path) → reliable for any
    //      profile (uses authenticated pool internally)
    //   4. Fail VALIDATION_FAIL
    let profileText = input.profileText;
    let textSource: 'manual' | 'tavily' | 'apify' = 'manual';

    // Layer 2 — Tavily (cheap when it works; ~$0/call w/ 1k free tier).
    if (!profileText && input.profileUrl && process.env['TAVILY_API_KEY']) {
      try {
        const extracted = await tavilyExtract([input.profileUrl]);
        const candidate = extracted[0]?.rawContent ?? '';
        if (candidate && !isLinkedInAntiScrapePage(candidate)) {
          profileText = candidate;
          textSource = 'tavily';
          logger.info(
            { accountId, profileUrl: input.profileUrl, len: candidate.length, source: 'tavily' },
            'optimize_profile tavily extract ok',
          );
        } else {
          logger.warn(
            { accountId, profileUrl: input.profileUrl, len: candidate.length },
            'tavily returned LinkedIn anti-scrape 404 page — falling through to Apify',
          );
        }
      } catch (err) {
        logger.warn(
          { err: (err as Error).message, profileUrl: input.profileUrl },
          'tavily extract threw — falling through to Apify',
        );
      }
    }

    // Layer 3 — Apify (works for any profile, costs ~$0.024/call).
    if (!profileText && input.profileUrl) {
      try {
        const profile = await scrapeProfile({ accountId, profileUrl: input.profileUrl });
        profileText = profileDataToText(profile);
        textSource = 'apify';
        logger.info(
          { accountId, profileUrl: input.profileUrl, len: profileText.length, source: 'apify', name: profile.fullName },
          'optimize_profile apify fallback ok',
        );
      } catch (err) {
        logger.error(
          { err: (err as Error).message, profileUrl: input.profileUrl },
          'optimize_profile apify fallback also failed',
        );
        throw new AppError(
          'EXTERNAL_API_FAIL',
          `Both Tavily and Apify could not extract profile from ${input.profileUrl}. Pass profileText manually as workaround.`,
          { tool: 'optimize_profile', profileUrl: input.profileUrl },
        );
      }
    }

    if (!profileText) {
      throw new AppError(
        'VALIDATION_FAIL',
        'Supply profileText directly OR pass profileUrl (with TAVILY_API_KEY or APIFY_TOKEN env set on server).',
        { tool: 'optimize_profile' },
      );
    }

    logger.info(
      { accountId, targetRole: input.targetRole, len: profileText.length, textSource },
      'optimize_profile invoked',
    );

    // Provider-agnostic LLM call. Resolves OPENROUTER_API_KEY → ANTHROPIC_API_KEY
    // → OPENAI_API_KEY in that order, or honors LLM_PROVIDER if set explicitly.
    const text = await invokeLlm({
      userPrompt: buildPrompt(input.targetRole, profileText),
      maxTokens: 4096,
      temperature: 0.4,
    });

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
