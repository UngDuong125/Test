import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chunk, csvToImportRows, parseCsv } from '@/lib/import-csv';

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, CRLF and BOM', () => {
    assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n'), [
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });

  it('detects semicolon and tab delimiters', () => {
    assert.deepEqual(parseCsv('a;b\n1;2'), [
      ['a', 'b'],
      ['1', '2'],
    ]);
    assert.deepEqual(parseCsv('a\tb\n1\t2'), [
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('skips blank lines', () => {
    assert.equal(parseCsv('a\n\n1\n').length, 2);
  });
});

describe('csvToImportRows', () => {
  it('maps Vietnamese headers and ignores unknown columns', () => {
    const { rows, ignoredColumns } = csvToImportRows(
      'Tên đăng nhập;Họ tên;Lớp;Ghi chú\nhs01;Nguyễn Văn A;8A1;x\nhs02;;;',
    );
    assert.deepEqual(rows, [
      { username: 'hs01', displayName: 'Nguyễn Văn A', className: '8A1' },
      { username: 'hs02', displayName: null, className: null },
    ]);
    assert.deepEqual(ignoredColumns, ['Ghi chú']);
  });

  it('requires a username column', () => {
    assert.throws(() => csvToImportRows('name,email\nA,a@x.vn'), /username/);
  });
});

describe('chunk', () => {
  it('splits into fixed-size batches', () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });
});
