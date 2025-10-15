import { describe, expect, test } from 'vitest';
import iconv from '../../src/lib/iconv.js';

describe('iconv', () => {
  test('characters with accents should be converted to ibus ascii', () => {
    const result = iconv.utf8_ibusascii('Räksmörgås');
    expect(result).toBe('R\xa4ksm\xa5rgaas');
  });
  test('remove diacriticals', () => {
    const result = iconv.utf8_ibusascii(`Plus ça change, plus c'est la même chose. 42!`);
    expect(result).toBe(`Plus ca change, plus c'est la meme chose. 42!`);
  });
});
