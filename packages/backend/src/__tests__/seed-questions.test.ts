import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Parses the seed file to extract question data for validation.
 * This avoids needing a database connection for these tests.
 */
function loadSeedSource(): string {
  const seedPath = resolve(__dirname, '../../prisma/seed.ts');
  return readFileSync(seedPath, 'utf-8');
}

/** Patterns that indicate the question is giving away the solution approach. */
const SOLUTION_HINT_PATTERNS = [
  /use a (?:combination of |mix of )?(?:a )?(?:hash ?map|linked list|doubly linked list|BST|binary search tree|heap|trie|stack|queue|graph|set)/i,
  /implement (?:using|with|via) (?:a )?(?:hash ?map|linked list|doubly linked list|BST|binary search tree|heap|trie)/i,
  /the (?:key |trick |solution |approach )is to use/i,
  /hint:.*(?:hash ?map|linked list|tree|graph|stack|queue)/i,
];

/**
 * Extracts description blocks from the seed file source.
 * Matches `description: \`...\`` template literal blocks.
 */
function extractDescriptions(source: string): { title: string; description: string }[] {
  const results: { title: string; description: string }[] = [];

  // Match title and description pairs from the questions array
  const titleRegex = /title:\s*'([^']+)'/g;
  const descRegex = /description:\s*`([\s\S]*?)`/g;

  const titles: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = titleRegex.exec(source)) !== null) {
    titles.push(match[1]);
  }

  const descriptions: string[] = [];
  while ((match = descRegex.exec(source)) !== null) {
    descriptions.push(match[1]);
  }

  for (let i = 0; i < Math.min(titles.length, descriptions.length); i++) {
    results.push({ title: titles[i], description: descriptions[i] });
  }

  return results;
}

describe('Seed question validation', () => {
  const source = loadSeedSource();
  const questions = extractDescriptions(source);

  it('seed file contains questions', () => {
    expect(questions.length).toBeGreaterThanOrEqual(8);
  });

  for (const q of questions) {
    it(`"${q.title}" description does not contain solution hints`, () => {
      for (const pattern of SOLUTION_HINT_PATTERNS) {
        expect(q.description).not.toMatch(pattern);
      }
    });
  }

  it('all questions have C# starter code', () => {
    const csharpStarterRegex = /language:\s*'csharp'/g;
    const csharpCount = (source.match(csharpStarterRegex) ?? []).length;
    expect(csharpCount).toBe(questions.length);
  });

  it('all questions have TypeScript starter code', () => {
    const tsStarterRegex = /language:\s*'typescript'/g;
    const tsCount = (source.match(tsStarterRegex) ?? []).length;
    expect(tsCount).toBe(questions.length);
  });

  it('all questions have JavaScript starter code', () => {
    const jsStarterRegex = /language:\s*'javascript'/g;
    const jsCount = (source.match(jsStarterRegex) ?? []).length;
    expect(jsCount).toBe(questions.length);
  });
});
