import { describe, it, expect, vi } from 'vitest';
import { Router, TW } from '../lib/index.js';
describe('Hash router', () => {
  it('decodes params and separates query strings', async () => {
    window.location.hash = '#/posts/a%20b?comments=1'; const handler = vi.fn(); await new Router().route('/posts/:id', handler).dispatch();
    expect(handler.mock.calls[0][0].params).toEqual({ id: 'a b' }); expect(handler.mock.calls[0][0].query.get('comments')).toBe('1');
  });
  it('aborts stale navigation and handles malformed or missing routes', async () => {
    const notFound = vi.fn(); let first; const router = new Router({ notFound }).route('/posts/:id', ({ signal }) => { first = signal; });
    window.location.hash = '#/posts/1'; await router.dispatch(); window.location.hash = '#/missing'; await router.dispatch(); expect(first.aborted).toBe(true);
    window.location.hash = '#/posts/%ZZ'; await router.dispatch(); expect(notFound).toHaveBeenCalledTimes(2);
  });
  it('gives slow handlers a signal to prevent stale state', async () => {
    let release; const updates = []; const router = new Router().route('/slow', async ({ signal }) => { await new Promise(resolve => { release = resolve; }); if (!signal.aborted) updates.push('slow'); }).route('/fast', () => updates.push('fast'));
    window.location.hash = '#/slow'; const pending = router.dispatch(); window.location.hash = '#/fast'; await router.dispatch(); release(); await pending; expect(updates).toEqual(['fast']);
  });
  it('registers once and cleans up its listener', () => {
    const add = vi.spyOn(window, 'addEventListener'); const remove = vi.spyOn(window, 'removeEventListener'); const router = new Router(); router.start().start(); router.stop();
    expect(add.mock.calls.filter(([name]) => name === 'hashchange')).toHaveLength(1); expect(remove).toHaveBeenCalledWith('hashchange', router.listener); add.mockRestore(); remove.mockRestore();
  });
});
describe('Tailwind helpers', () => {
  it('resolves variants, defaults and conflicting utility overrides', () => {
    const ui = TW.define({ button: { base: 'px-2 bg-white', variants: { tone: { green: 'bg-emerald-800', red: 'bg-red-700' } }, defaults: { tone: 'green' } } });
    expect(ui.button()).toContain('bg-emerald-800'); expect(ui.button()).not.toContain('bg-white'); expect(ui.button({ tone: 'red', class: 'px-6' })).toBe('bg-red-700 px-6'); expect(TW.cx('p-2', false, ['p-4', null])).toBe('p-4');
  });
});
