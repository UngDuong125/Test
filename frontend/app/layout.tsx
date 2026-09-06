import type { Metadata } from 'next';
import './globals.css';
import { AppHeader } from '@/components/auth/AppHeader';

export const metadata: Metadata = {
  title: 'TestArchive',
  description: 'Hệ thống tạo và phân phối đề học tập THCS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AppHeader />
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
