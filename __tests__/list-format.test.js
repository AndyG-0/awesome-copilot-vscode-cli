const { formatListLines } = require('../src/commands/list');

describe('formatListLines', () => {
  test('produces header, delimiter and aligned rows', () => {
    const items = [
      { type: 'prompt', id: 'p1', name: 'Short' },
      { type: 'chatmode', id: 'longer-id', name: 'A longer name' },
      { type: 'instruction', id: 'i', name: '' }
    ];
    const lines = formatListLines(items);
    // Should have header and delimiter as first two lines
    expect(lines.length).toBeGreaterThanOrEqual(5);
    const header = lines[0];
    const delim = lines[1];
    expect(header).toMatch(/Type\s+ID\s+Name/);
    expect(delim).toMatch(/^-+\s+-+\s+-+/);

    // All subsequent rows should have the same column boundaries as header
    const headerCols = header.split(/\s{2,}/);
    const colWidths = headerCols.map(c => c.length);

    for (let i = 2; i < lines.length; i++) {
      const cols = lines[i].split(/\s{2,}/);
      expect(cols.length).toBe(3);
      // each column should be at least as wide as header's column
      for (let j = 0; j < 3; j++) {
        expect(cols[j].length).toBeGreaterThanOrEqual(colWidths[j]);
      }
    }
  });
});
