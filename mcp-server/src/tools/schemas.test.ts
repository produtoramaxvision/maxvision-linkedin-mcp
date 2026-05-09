import { describe, it, expect } from 'vitest';
import { JobUrlSchema, GetJobDetailsInputSchema } from './schemas.js';

describe('JobUrlSchema (v0.13.2 normalizer)', () => {
  it('normalizes canonical www URL', () => {
    expect(JobUrlSchema.parse('https://www.linkedin.com/jobs/view/4198123483/')).toBe(
      'https://www.linkedin.com/jobs/view/4198123483/',
    );
  });

  it('normalizes br subdomain + slug variant from search_jobs', () => {
    const raw = 'https://br.linkedin.com/jobs/view/engenheiro-de-software-at-xp-inc-4198123483';
    expect(JobUrlSchema.parse(raw)).toBe('https://www.linkedin.com/jobs/view/4198123483/');
  });

  it('strips query params and trailing tracking', () => {
    const raw = 'https://www.linkedin.com/jobs/view/4198123483?refId=abc&trk=public_jobs_topcard';
    expect(JobUrlSchema.parse(raw)).toBe('https://www.linkedin.com/jobs/view/4198123483/');
  });

  it('handles uk subdomain + numeric only', () => {
    expect(JobUrlSchema.parse('https://uk.linkedin.com/jobs/view/9876543210/')).toBe(
      'https://www.linkedin.com/jobs/view/9876543210/',
    );
  });

  it('handles no-subdomain variant', () => {
    expect(JobUrlSchema.parse('https://linkedin.com/jobs/view/some-slug-1234567890/?lipi=x')).toBe(
      'https://www.linkedin.com/jobs/view/1234567890/',
    );
  });

  it('rejects non-LinkedIn URLs', () => {
    expect(() => JobUrlSchema.parse('https://indeed.com/jobs/view/12345')).toThrow();
  });

  it('rejects URLs without numeric job id', () => {
    expect(() => JobUrlSchema.parse('https://www.linkedin.com/jobs/search/?keywords=foo')).toThrow();
  });

  it('GetJobDetailsInputSchema applies the normalizer', () => {
    const out = GetJobDetailsInputSchema.parse({
      accountId: 'sandbox-2',
      jobUrl: 'https://br.linkedin.com/jobs/view/foo-bar-4198123483?x=1',
    });
    expect(out.jobUrl).toBe('https://www.linkedin.com/jobs/view/4198123483/');
    expect(out.accountId).toBe('sandbox-2');
  });

  it('GetJobDetailsInputSchema defaults accountId to "default"', () => {
    const out = GetJobDetailsInputSchema.parse({
      jobUrl: 'https://www.linkedin.com/jobs/view/4198123483/',
    });
    expect(out.accountId).toBe('default');
  });
});
