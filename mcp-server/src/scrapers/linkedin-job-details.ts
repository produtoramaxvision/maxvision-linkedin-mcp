import { logger } from '../logger.js';

export interface JobDetails {
  url: string;
  jobId: string;
  title: string;
  company: string;
  companyUrl?: string;
  location: string;
  postedAt: string;        // ISO
  applicants: number | null;
  salary: string | null;
  workplace: 'remote' | 'hybrid' | 'on-site' | null;
  employmentType: string | null;  // Full-time, Contract, etc.
  seniority: string | null;
  description: string;
  requirements: string[];
  easyApply: boolean;
  hiringManager: { name: string; title: string } | null;
  fetchedAt: string;
}

// TODO Sprint 1.5 — replace mock with Patchright nav to /jobs/view/<jobId>/.
// Real impl: extract jobId from URL, navigate, wait for [data-job-details],
// scrape title/company/description/applicants. Handle "see more" expand.
export async function scrapeJobDetails(args: {
  accountId: string;
  jobUrl: string;
}): Promise<JobDetails> {
  logger.warn({ accountId: args.accountId, jobUrl: args.jobUrl }, 'scrapeJobDetails MOCK — returning fixture');

  const jobId = extractJobId(args.jobUrl);

  return {
    url: args.jobUrl,
    jobId,
    title: 'Senior Backend Engineer',
    company: 'Acme Corp',
    companyUrl: 'https://www.linkedin.com/company/acme-corp/',
    location: 'São Paulo, BR (Hybrid)',
    postedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    applicants: 42,
    salary: 'R$ 18,000 - R$ 25,000 / month',
    workplace: 'hybrid',
    employmentType: 'Full-time',
    seniority: 'Senior',
    description: 'Mock job description — Sprint 1.5 replaces with real /jobs/view/ scrape. Build scalable backend systems with TypeScript and Node.js. Lead architecture decisions for distributed services.',
    requirements: [
      '5+ years TypeScript/Node.js',
      'PostgreSQL + Redis at scale',
      'Docker / Kubernetes',
      'System design',
      'Strong communication',
    ],
    easyApply: true,
    hiringManager: { name: 'Jane Doe', title: 'Engineering Manager' },
    fetchedAt: new Date().toISOString(),
  };
}

/** Extract numeric jobId from `/jobs/view/<id>` LinkedIn URL. Throws if not matched. */
export function extractJobId(url: string): string {
  const m = url.match(/\/jobs\/view\/(\d+)/i);
  if (!m) throw new Error(`Not a LinkedIn job URL: ${url}`);
  return m[1]!;
}
