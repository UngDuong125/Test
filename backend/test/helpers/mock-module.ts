import { mock } from 'node:test';

/**
 * Replace a module for subsequent imports. Every exported function not listed in
 * `overrides` throws when called, so a test fails loudly instead of hitting Supabase.
 */
export async function mockModule(href: string, overrides: Record<string, unknown>): Promise<void> {
  const real = (await import(href)) as Record<string, unknown>;
  const exports: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(real)) {
    exports[key] =
      typeof value === 'function'
        ? () => {
            throw new Error(`Unmocked call: ${key} (${href})`);
          }
        : value;
  }
  for (const key of Object.keys(overrides)) {
    if (!(key in real)) throw new Error(`${href} has no export "${key}"`);
  }
  Object.assign(exports, overrides);
  mockModuleExports(href, exports);
}

/** Node 24 renamed `namedExports` to `exports`; Node 22 only knows the old name. */
export function mockModuleExports(href: string, exports: Record<string, unknown>): void {
  const major = Number(process.versions.node.split('.')[0]);
  const options = major >= 24 ? { exports } : { namedExports: exports };
  mock.module(href, options as Parameters<typeof mock.module>[1]);
}

export function src(path: string): string {
  return new URL(`../../src/${path}`, import.meta.url).href;
}
