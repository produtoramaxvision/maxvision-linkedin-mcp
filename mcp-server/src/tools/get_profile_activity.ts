/**
 * tools/get_profile_activity — Sprint 7 Apify-backed.
 *
 * Returns a profile's recent posts and/or reactions. Useful for warm-lead
 * detection: a prospect liking a competitor's post is a strong intent signal.
 *
 * Combines two harvestapi actors in parallel:
 *   - linkedin-profile-posts (posts authored by the profile)
 *   - linkedin-profile-reactions (likes/comments by the profile)
 */
import { withInstrumentation } from './_base.js';
import { GetProfileActivityInputSchema, type GetProfileActivityInput } from './schemas.js';
import { runApifyActor } from '../scrapers/apify-helper.js';
import { logger } from '../logger.js';

const POSTS_ACTOR = process.env['APIFY_LINKEDIN_PROFILE_POSTS_ACTOR'] ?? 'harvestapi~linkedin-profile-posts';
const REACTIONS_ACTOR = process.env['APIFY_LINKEDIN_PROFILE_REACTIONS_ACTOR'] ?? 'harvestapi~linkedin-profile-reactions';

interface ActivityItem {
  url: string;
  type: 'post' | 'reaction';
  text: string;
  postedAt: string;
  engagementCount: number;
}

export interface GetProfileActivityOutput {
  profileUrl: string;
  count: number;
  posts: ActivityItem[];
  reactions: ActivityItem[];
}

export const getProfileActivity = withInstrumentation<GetProfileActivityInput, GetProfileActivityOutput>({
  name: 'get_profile_activity',
  description: 'Fetch recent posts and reactions for a LinkedIn profile (warm-lead signals).',
  inputSchema: GetProfileActivityInputSchema,
  handler: async ({ input, accountId }) => {
    logger.info({ accountId, profileUrl: input.profileUrl, include: input.include }, 'get_profile_activity start');

    const str = (v: unknown): string => (v == null ? '' : String(v));
    const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
    const dateStr = (v: unknown): string => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        // post-search style: { date: ISO, timestamp: number, postedAgoShort: string }
        if (typeof o['date'] === 'string') return o['date'];
        if (typeof o['text'] === 'string') return o['text'];
        // profile-detail style: { month: number, year: number }
        const m = o['month'] != null ? String(o['month']) : '';
        const y = o['year'] != null ? String(o['year']) : '';
        return [m, y].filter(Boolean).join(' ');
      }
      return String(v);
    };

    const wantPosts = input.include === 'posts' || input.include === 'both';
    const wantReactions = input.include === 'reactions' || input.include === 'both';

    const [postsRaw, reactionsRaw] = await Promise.all([
      wantPosts
        ? runApifyActor({
            actor: POSTS_ACTOR,
            context: 'get_profile_activity:posts',
            input: { targetUrls: [input.profileUrl], maxItems: input.maxResults },
          }).catch((err) => {
            logger.warn({ accountId, err: err instanceof Error ? err.message : String(err) }, 'profile-posts fetch failed');
            return [] as Array<Record<string, unknown>>;
          })
        : Promise.resolve([] as Array<Record<string, unknown>>),
      wantReactions
        ? runApifyActor({
            actor: REACTIONS_ACTOR,
            context: 'get_profile_activity:reactions',
            input: { profiles: [input.profileUrl], maxItems: input.maxResults },
          }).catch((err) => {
            logger.warn({ accountId, err: err instanceof Error ? err.message : String(err) }, 'profile-reactions fetch failed');
            return [] as Array<Record<string, unknown>>;
          })
        : Promise.resolve([] as Array<Record<string, unknown>>),
    ]);

    // profile-posts shape: { id, linkedinUrl, content, type, ... }
    const posts: ActivityItem[] = postsRaw.slice(0, input.maxResults).map((p) => ({
      url: str(p['linkedinUrl'] ?? p['url'] ?? p['postUrl']),
      type: 'post' as const,
      text: str(p['content'] ?? p['text'] ?? p['body']).slice(0, 1500),
      postedAt: dateStr(p['postedAt'] ?? p['date'] ?? p['createdAt']),
      engagementCount: num(p['likes'] ?? p['numLikes'] ?? p['reactions']),
    }));

    // profile-reactions shape: { id, linkedinUrl, action, createdAt, ... }
    const reactions: ActivityItem[] = reactionsRaw.slice(0, input.maxResults).map((r) => ({
      url: str(r['linkedinUrl'] ?? r['url'] ?? r['postUrl']),
      type: 'reaction' as const,
      text: str(r['action'] ?? r['text'] ?? r['postText'] ?? r['snippet']).slice(0, 800),
      postedAt: dateStr(r['createdAt'] ?? r['reactedAt'] ?? r['date']),
      engagementCount: num(r['likes'] ?? r['numLikes']),
    }));

    return {
      profileUrl: input.profileUrl,
      count: posts.length + reactions.length,
      posts,
      reactions,
    };
  },
});
