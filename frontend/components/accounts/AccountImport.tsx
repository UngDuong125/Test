'use client';

import { useState } from 'react';
import {
  ApiError,
  importAccounts,
  type ImportAccountRow,
  type ImportAccountsResult,
} from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { chunk, csvToImportRows } from '@/lib/import-csv';

/** Matches the server limit (bcrypt per account keeps one request short). */
const BATCH = 50;

const SAMPLE = 'username;Họ tên;Lớp;email\nnguyenvana;Nguyễn Văn A;8A1;\ntranthib;Trần Thị B;8A1;b@truong.edu.vn';

type Created = ImportAccountsResult['created'][number];

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Printable slips: one per student with username and temporary password. */
function printSlips(created: Created[], expiresAt: string | undefined) {
  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return;
  const until = expiresAt ? new Date(expiresAt).toLocaleDateString('vi-VN') : '';
  const slips = created
    .map(
      (c) => `<div class="slip"><p class="name">${escapeHtml(c.displayName ?? c.username)}${
        c.className ? ` · Lớp ${escapeHtml(c.className)}` : ''
      }</p><p>Tên đăng nhập: <b>${escapeHtml(c.username)}</b></p><p>Mật khẩu tạm: <b class="pw">${escapeHtml(
        c.temporaryPassword,
      )}</b></p><p class="note">Đổi mật khẩu ở lần đăng nhập đầu. Hết hạn ${until}.</p></div>`,
    )
    .join('');
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu tài khoản</title>
<style>body{font-family:system-ui,sans-serif;margin:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.slip{border:1px dashed #64748b;padding:10px 12px;break-inside:avoid}.slip p{margin:4px 0}.name{font-weight:600}
.pw{font-family:monospace;font-size:16px;letter-spacing:1px}.note{font-size:12px;color:#475569}</style></head>
<body><div class="grid">${slips}</div><script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

export function AccountImport({ onCreated }: { onCreated?: () => void }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ImportAccountRow[]>([]);
  const [check, setCheck] = useState<{ valid: ImportAccountsResult['valid']; errors: ImportAccountsResult['errors'] } | null>(null);
  const [created, setCreated] = useState<Created[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | undefined>();
  const [sendEmail, setSendEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function runCheck(source: string) {
    setError(null);
    setNotice(null);
    setCheck(null);
    setCreated([]);
    let parsed: ImportAccountRow[];
    try {
      const { rows: r, ignoredColumns } = csvToImportRows(source);
      parsed = r;
      if (ignoredColumns.length) setNotice(`Bỏ qua cột: ${ignoredColumns.join(', ')}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đọc được CSV');
      return;
    }
    if (parsed.length === 0) {
      setError('Không có dòng dữ liệu nào');
      return;
    }
    setRows(parsed);
    setBusy(true);
    try {
      const valid: ImportAccountsResult['valid'] = [];
      const errors: ImportAccountsResult['errors'] = [];
      const parts = chunk(parsed, BATCH);
      for (let p = 0; p < parts.length; p += 1) {
        const res = await importAccounts({ rows: parts[p], dryRun: true, sendEmail: false });
        // Server numbers lines per request; shift back to the line in the whole file.
        const shift = p * BATCH;
        valid.push(...res.valid.map((v) => ({ ...v, line: v.line + shift })));
        errors.push(...res.errors.map((e) => ({ ...e, line: e.line + shift })));
      }
      setCheck({ valid, errors });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kiểm tra thất bại');
    } finally {
      setBusy(false);
    }
  }

  async function runCreate() {
    if (!check || check.valid.length === 0) return;
    const okLines = new Set(check.valid.map((v) => v.line));
    const toCreate = rows.filter((_, i) => okLines.has(i + 2));
    if (!window.confirm(`Tạo ${toCreate.length} tài khoản? Dòng lỗi sẽ không được tạo.`)) return;
    setBusy(true);
    setError(null);
    const all: Created[] = [];
    const failures: string[] = [];
    try {
      for (const part of chunk(toCreate, BATCH)) {
        const res = await importAccounts({ rows: part, dryRun: false, sendEmail });
        all.push(...res.created);
        failures.push(...res.errors.map((e) => `${e.username}: ${e.message}`));
        setExpiresAt(res.expiresAt);
      }
    } catch (err) {
      failures.push(err instanceof ApiError ? err.message : 'Tạo thất bại giữa chừng');
    } finally {
      setBusy(false);
    }
    setCreated(all);
    setCheck(null);
    setNotice(`Đã tạo ${all.length} tài khoản. Hãy in phiếu hoặc tải danh sách ngay: mật khẩu chỉ hiện một lần.`);
    if (failures.length) setError(failures.join('; '));
    onCreated?.();
  }

  return (
    <section className="space-y-4 rounded-xl border border-mist bg-white p-6 shadow-sm">
      <div>
        <h2 className="font-semibold text-ink">Tạo tài khoản hàng loạt (CSV)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Cột bắt buộc: <code>username</code>. Tùy chọn: <code>Họ tên</code>, <code>Lớp</code>, <code>email</code>,{' '}
          <code>role</code> (mặc định student). Học sinh không cần email. Mỗi tài khoản nhận một mật khẩu tạm ngẫu nhiên.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Chọn file CSV"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void file.text().then((t) => {
              setText(t);
              void runCheck(t);
            });
          }}
        />
        <button type="button" onClick={() => setText(SAMPLE)} className="text-accentDark hover:underline">
          Dùng mẫu
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={SAMPLE}
        aria-label="Nội dung CSV"
        className="w-full rounded-md border border-mist px-3 py-2 font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => void runCheck(text)}
          className="rounded-md border border-mist px-3 py-2 text-sm hover:border-accent disabled:opacity-50"
        >
          {busy && !check ? 'Đang kiểm tra…' : 'Kiểm tra'}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          Gửi email mời cho dòng có email
        </label>
      </div>

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {check && (
        <div className="space-y-3">
          <p className="text-sm">
            <strong>{check.valid.length}</strong> dòng hợp lệ ·{' '}
            <strong className={check.errors.length ? 'text-red-700' : ''}>{check.errors.length}</strong> dòng lỗi
          </p>
          {check.errors.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {check.errors.map((e) => (
                <li key={`${e.line}-${e.username}`}>
                  Dòng {e.line} ({e.username || 'trống'}): {e.message}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={busy || check.valid.length === 0}
            onClick={() => void runCreate()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accentDark disabled:opacity-50"
          >
            {busy ? 'Đang tạo…' : `Tạo ${check.valid.length} tài khoản`}
          </button>
        </div>
      )}

      {created.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => printSlips(created, expiresAt)}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accentDark"
            >
              In phiếu cho học sinh
            </button>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  'tai-khoan-moi.csv',
                  toCsv(
                    ['Tên đăng nhập', 'Họ tên', 'Lớp', 'Mật khẩu tạm'],
                    created.map((c) => [c.username, c.displayName ?? '', c.className ?? '', c.temporaryPassword]),
                  ),
                )
              }
              className="rounded-md border border-mist px-3 py-2 text-sm hover:border-accent"
            >
              Tải danh sách (CSV)
            </button>
          </div>
          <div className="max-h-72 overflow-auto rounded-md border border-mist">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tên đăng nhập</th>
                  <th className="px-3 py-2">Họ tên</th>
                  <th className="px-3 py-2">Lớp</th>
                  <th className="px-3 py-2">Mật khẩu tạm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {created.map((c) => (
                  <tr key={c.userId}>
                    <td className="px-3 py-1.5 font-medium">{c.username}</td>
                    <td className="px-3 py-1.5">{c.displayName ?? '—'}</td>
                    <td className="px-3 py-1.5">{c.className ?? '—'}</td>
                    <td className="px-3 py-1.5 font-mono">{c.temporaryPassword}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
