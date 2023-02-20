// See character mapping: https://github.com/dfuchslin/midpixels
import latinize from 'latinize';

const unknown = '\xc3';
const mapping: Record<string, string> = {
  'ß': '\xa0',
  'Ä': '\xa1',
  'Ö': '\xa2',
  'Ü': '\xa3',
  'ä': '\xa4',
  'ö': '\xa5',
  'ü': '\xa6',
  'Å': 'AA',
  'Æ': 'AE',
  'ø': 'oe',
  'Ø': 'OE',
  'å': 'aa',
  'æ': 'ae',
};

const utf8_ibusascii = (text: string): string => {
  const result: string[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text.charAt(i++);
    if (char.charCodeAt(0) < 128) {
      result.push(char);
    } else if (mapping[char]) {
      result.push(mapping[char]);
    } else {
      result.push(latinize.characters[char] ?? unknown);
    }
  }
  return result.join('');
};

export default {
  utf8_ibusascii,
};
