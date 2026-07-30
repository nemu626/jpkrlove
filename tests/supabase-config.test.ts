import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readConfig(): string {
  return readFileSync(
    resolve(import.meta.dirname, '../supabase/config.toml'),
    'utf8',
  );
}

function readApiSchemas(): string[] {
  const config = readConfig();
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

  it('lets the provider webhook reach its signature verifier without a JWT', () => {
    const config = readConfig();
    const webhookSection = config.match(
      /\[functions\.identity-webhook\]\s+([\s\S]*?)(?=\n\[|$)/,
    )?.[1];

    expect(webhookSection).toMatch(/^verify_jwt\s*=\s*false$/m);
    expect(config).not.toMatch(
      /\[functions\.(?:redeem-invitation|create-identity-session)\][\s\S]*?verify_jwt\s*=\s*false/,
    );
  });
});
