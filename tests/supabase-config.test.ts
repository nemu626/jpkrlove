import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readApiSchemas(): string[] {
  const config = readFileSync(
    resolve(import.meta.dirname, '../supabase/config.toml'),
    'utf8',
  );
  const apiSection = config.match(/\[api\]\s+([\s\S]*?)(?=\n\[|$)/)?.[1];
  const schemas = apiSection?.match(/^schemas\s*=\s*\[([^\]]*)\]/m)?.[1];

  if (!schemas) {
    throw new Error('supabase/config.toml is missing [api].schemas');
  }

  return [...schemas.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

describe('Supabase Data API configuration', () => {
  it('exposes only the approved schemas in contract order', () => {
    expect(readApiSchemas()).toEqual([
      'public',
      'app',
      'storage',
      'graphql_public',
    ]);
  });
});
