import { logger } from '../logger.js';

export interface ProfileExperience {
  title: string;
  company: string;
  startDate: string;       // ISO YYYY-MM
  endDate: string | null;  // null = current
  location?: string;
  description?: string;
}

export interface ProfileEducation {
  school: string;
  degree?: string;
  field?: string;
  startYear: number;
  endYear: number | null;
}

export interface ProfileData {
  url: string;
  publicId: string;        // slug from /in/<slug>
  fullName: string;
  headline: string;
  location: string;
  currentCompany: string | null;
  currentRole: string | null;
  summary: string;
  experience: ProfileExperience[];
  education: ProfileEducation[];
  skills: string[];
  fetchedAt: string;       // ISO 8601
}

// TODO Sprint 1.5 — replace mock with Patchright nav to profileUrl + DOM scrape.
// Real impl: acquire context from browserPool, navigate, wait for selectors,
// extract via context.evaluate(), close on error, log captcha events.
export async function scrapeProfile(args: {
  accountId: string;
  profileUrl: string;
}): Promise<ProfileData> {
  logger.warn({ accountId: args.accountId, profileUrl: args.profileUrl }, 'scrapeProfile MOCK — returning fixture');

  const slug = extractPublicId(args.profileUrl);

  return {
    url: args.profileUrl,
    publicId: slug,
    fullName: 'Mock Candidate',
    headline: 'Senior Software Engineer | TypeScript | LinkedIn Automation',
    location: 'São Paulo, BR',
    currentCompany: 'Acme Corp',
    currentRole: 'Senior Backend Engineer',
    summary: 'Mock summary — Sprint 1.5 will replace with real LinkedIn /in/<slug> scrape.',
    experience: [
      { title: 'Senior Backend Engineer', company: 'Acme Corp', startDate: '2023-01', endDate: null, location: 'São Paulo, BR', description: 'Mock current role.' },
      { title: 'Backend Engineer', company: 'Globex', startDate: '2020-06', endDate: '2022-12', location: 'Rio de Janeiro, BR', description: 'Mock prior role.' },
      { title: 'Junior Developer', company: 'Initech', startDate: '2018-03', endDate: '2020-05', location: 'Remote', description: 'Mock entry-level.' },
    ],
    education: [
      { school: 'USP', degree: 'BSc', field: 'Computer Science', startYear: 2014, endYear: 2018 },
      { school: 'Coursera', degree: 'Certificate', field: 'Distributed Systems', startYear: 2021, endYear: 2021 },
    ],
    skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Docker', 'Kubernetes', 'AWS', 'GraphQL', 'Redis', 'CI/CD', 'System Design'],
    fetchedAt: new Date().toISOString(),
  };
}

/** Extract `/in/<slug>` from a LinkedIn profile URL. Throws if not matched. */
export function extractPublicId(url: string): string {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!m) throw new Error(`Not a LinkedIn profile URL: ${url}`);
  return m[1]!.toLowerCase();
}
