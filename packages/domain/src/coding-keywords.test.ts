import { describe, expect, it } from 'vitest';
import { CODING_KEYWORDS, matchesProjectKeyword, normalizeKeywords, selectSearchTerms } from './coding-keywords.js';
import { policySchedule } from './policy-schedule.js';

describe('coding discovery', () => {
  it('covers coding disciplines without duplicate keywords', () => {
    expect(CODING_KEYWORDS.length).toBeGreaterThan(150);
    expect(CODING_KEYWORDS.length).toBeLessThanOrEqual(300);
    expect(new Set(CODING_KEYWORDS.map((term) => term.toLowerCase())).size).toBe(CODING_KEYWORDS.length);
    for (const term of ['React', 'Flutter', 'PostgreSQL', 'DevOps', 'C++', 'C#', '.NET', 'web scraping', 'automated testing']) expect(CODING_KEYWORDS).toContain(term);
  });
  it('matches punctuation and short language names without matching unrelated words', () => {
    expect(matchesProjectKeyword('Build a C++ application', 'C++')).toBe(true);
    expect(matchesProjectKeyword('C#/.NET backend', '.NET')).toBe(true);
    expect(matchesProjectKeyword('Django website', 'Go')).toBe(false);
    expect(matchesProjectKeyword('capital analysis', 'API')).toBe(false);
    expect(matchesProjectKeyword('REST\nAPI integration', 'REST API')).toBe(true);
    expect(matchesProjectKeyword('use Go for this backend', 'go')).toBe(true);
    expect(normalizeKeywords([' Python ', 'python', 'Laravel'])).toEqual(['python', 'Laravel']);
  });
  it('rotates all search terms rather than repeating the first eight', () => {
    const terms = Array.from({ length: 20 }, (_, index) => `keyword${index}`);
    const selected = new Set([0, 1, 2].flatMap((cycle) => selectSearchTerms([], terms, cycle)));
    expect(selected.size).toBe(20);
    expect(selectSearchTerms(['Python'], ['python'], 5)).toEqual(['python']);
  });
});

describe('policy schedule', () => {
  it('uses the policy timezone and attributes an overnight shift to its starting weekday', () => {
    const policy = { timezone: 'Asia/Jakarta', activeHours: { start: 22, end: 6 }, activeDays: [1] };
    expect(policySchedule(policy, new Date('2026-10-19T16:00:00Z')).active).toBe(true);
    expect(policySchedule(policy, new Date('2026-10-19T20:00:00Z')).active).toBe(true);
    expect(policySchedule(policy, new Date('2026-10-20T16:00:00Z')).active).toBe(false);
    expect(policySchedule(policy, new Date('2026-10-19T23:00:00Z')).active).toBe(false);
    expect(policySchedule({ timezone: 'Asia/Jakarta', activeHours: { start: 0, end: 24 } }, new Date('2026-10-19T23:00:00Z')).active).toBe(true);
  });
});
