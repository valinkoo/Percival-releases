import { describe, expect, it } from 'vitest';
import { parseServerUrl } from './server-url';

describe('parseServerUrl', () => {
  it.each([
    ['http://localhost:3000', 'http://localhost:3000'],
    ['localhost:3000', 'http://localhost:3000'],
    ['  127.0.0.1:3000/  ', 'http://127.0.0.1:3000'],
    ['https://machine.tail1234.ts.net', 'https://machine.tail1234.ts.net'],
    ['machine.tail1234.ts.net', 'https://machine.tail1234.ts.net'],
    ['https://machine.tail1234.ts.net/some/path?x=1', 'https://machine.tail1234.ts.net'],
  ])('accepts %s', (input, expected) => {
    expect(parseServerUrl(input)).toEqual({ ok: true, url: expected });
  });

  it.each([
    '',
    '   ',
    'http://example.com',
    'https://example.com',
    'serveur.exemple.com',
    'http://machine.tail1234.ts.net',
    'ftp://localhost',
    'https://evil.example/.ts.net',
    'https://machine.ts.net.evil.example',
    'not a url',
  ])('refuses %j with a message', (input) => {
    const result = parseServerUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(10);
  });
});
