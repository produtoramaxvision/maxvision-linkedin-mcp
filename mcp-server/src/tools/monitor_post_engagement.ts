/**
 * tools/monitor_post_engagement — Sprint 7 Apify-backed.
 *
 * Returns reactions + comments for a single LinkedIn post URL. Useful for
 * sentiment analysis, lead enrichment ("who liked our latest case study"),
 * and competitor engagement tracking.
 */
import { withInstrumentation } from './_base.js';
import { MonitorPostEngagementInputSchema, type MonitorPostEngagementInput } from './schemas.js';
import { runApifyActor } from '../scrapers/apify-helper.js';
import { logger } from '../logger.js';

const REACTIONS_ACTOR = process.env['APIFY_LINKEDIN_POST_REACTIONS_ACTOR'] ?? 'harvestapi~linkedin-post-reactions';
const COMMENTS_ACTOR = process.env['APIFY_LINKEDIN_POST_COMMENTS_ACTOR'] ?? 'harvestapi~linkedin-post-comments';

interface ReactionItem {
  reactor: string;
  reactorUrl: string;
  reactorHeadline: string;
  reactionType: string;
}

interface CommentItem {
  commenter: string;
  commenterUrl: string;
  commenterHeadline: string;
  text: string;
  postedAt: string;
  likes: number;
}

export interface MonitorPostEngagementOutput {
  postUrl: string;
  reactionsCount: number;
  commentsCount: number;
  reactions: ReactionItem[];
  comments: CommentItem[];
}

export const monitorPostEngagement = withInstrumentation<MonitorPostEngagementInput, MonitorPostEngagementOutput>({
  name: 'monitor_post_engagement',
  description: 'Fetch reactions + comments for a LinkedIn post (engagement insights, lead enrichment).',
  inputSchema: MonitorPostEngagementInputSchema,
  handler: async ({ input, accountId }) => {
    logger.info({ accountId, postUrl: input.postUrl, include: input.include }, 'monitor_post_engagement start');

    const str = (v: unknown): string => (v == null ? '' : String(v));
    const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
    const dateStr = (v: unknown): string => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (typeof o['date'] === 'string') return o['date'];
        if (typeof o['text'] === 'string') return o['text'];
        const m = o['month'] != null ? String(o['month']) : '';
        const y = o['year'] != null ? String(o['year']) : '';
        return [m, y].filter(Boolean).join(' ');
      }
      return String(v);
    };
    const wantR = input.include === 'reactions' || input.include === 'both';
    const wantC = input.include === 'comments' || input.include === 'both';

    const [reactionsRaw, commentsRaw] = await Promise.all([
      wantR
        ? runApifyActor({
            actor: REACTIONS_ACTOR,
            context: 'monitor_post_engagement:reactions',
            input: { posts: [input.postUrl], maxItems: input.maxReactions },
          }).catch((err) => {
            logger.warn({ accountId, err: err instanceof Error ? err.message : String(err) }, 'post-reactions fetch failed');
            return [] as Array<Record<string, unknown>>;
          })
        : Promise.resolve([] as Array<Record<string, unknown>>),
      wantC
        ? runApifyActor({
            actor: COMMENTS_ACTOR,
            context: 'monitor_post_engagement:comments',
            input: { posts: [input.postUrl], maxItems: input.maxComments },
          }).catch((err) => {
            logger.warn({ accountId, err: err instanceof Error ? err.message : String(err) }, 'post-comments fetch failed');
            return [] as Array<Record<string, unknown>>;
          })
        : Promise.resolve([] as Array<Record<string, unknown>>),
    ]);

    // Reaction shape: { id, reactionType, postId, actor: { id, name, linkedinUrl, position, pictureUrl } }
    const reactions: ReactionItem[] = reactionsRaw.slice(0, input.maxReactions).map((r) => {
      const a = (r['actor'] as Record<string, unknown> | undefined) ?? {};
      return {
        reactor: str(a['name'] ?? r['name']),
        reactorUrl: str(a['linkedinUrl'] ?? r['url'] ?? r['profileUrl']),
        reactorHeadline: str(a['position'] ?? r['headline']),
        reactionType: str(r['reactionType'] ?? r['type'] ?? 'LIKE'),
      };
    });

    // Comment shape: { id, linkedinUrl, commentary, createdAt, engagement: {likes, ...},
    //                  actor: { id, name, linkedinUrl, position } }
    const comments: CommentItem[] = commentsRaw.slice(0, input.maxComments).map((c) => {
      const a = (c['actor'] as Record<string, unknown> | undefined) ?? {};
      const eng = (c['engagement'] as Record<string, unknown> | undefined) ?? {};
      return {
        commenter: str(a['name'] ?? c['commenterName'] ?? c['name']),
        commenterUrl: str(a['linkedinUrl'] ?? c['commenterUrl'] ?? c['profileUrl']),
        commenterHeadline: str(a['position'] ?? c['commenterHeadline'] ?? c['headline']),
        text: str(c['commentary'] ?? c['text'] ?? c['content']).slice(0, 1500),
        postedAt: dateStr(c['createdAt'] ?? c['postedAt'] ?? c['date']),
        likes: num(eng['likes'] ?? c['likes'] ?? c['numLikes']),
      };
    });

    return {
      postUrl: input.postUrl,
      reactionsCount: reactions.length,
      commentsCount: comments.length,
      reactions,
      comments,
    };
  },
});
