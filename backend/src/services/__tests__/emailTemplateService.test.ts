import { renderEmailTemplate } from '../emailTemplateService';

describe('renderEmailTemplate', () => {
  it('replaces known keys', () => {
    expect(
      renderEmailTemplate('{{a}} and {{b}}', { a: '1', b: '2' })
    ).toBe('1 and 2');
  });
  it('leaves empty for missing keys', () => {
    expect(renderEmailTemplate('x{{k}}x', {})).toBe('xx');
  });
  it('trims key spaces', () => {
    expect(renderEmailTemplate('{{ orderNumber }}', { orderNumber: 'A' })).toBe('A');
  });
});
