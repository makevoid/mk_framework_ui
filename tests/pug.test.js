import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { compile, compileClient } from '../lib/pug/index.js';
import mkframePug from '../lib/pug/vite.js';

describe('Pug compilation pipeline', () => {
  it('generates equivalent standalone client and server templates with stable source and record identities', () => {
    const source = 'main\n  if notice\n    p= notice\n  each item in items\n    article\n      h2= item.title';
    const options = { filename: 'items.pug' };
    const server = compile(source, options);
    const { body } = compileClient(source, options);
    const client = new Function(`${body}; return template;`)();
    const locals = { notice: '', items: [{ id: 1, title: '<unsafe>' }, { id: 2, title: 'Second' }] };
    expect(client(locals)).toBe(server(locals));

    const root = document.createElement('div');
    root.innerHTML = client(locals);
    const site = root.querySelector('article').dataset.mkSite;
    expect(root.querySelector('article').dataset.key).toBe('[1]');
    expect(root.querySelector('h2').textContent).toBe('<unsafe>');
    expect(root.querySelector('unsafe')).toBeNull();
    root.innerHTML = client({ ...locals, notice: 'Added', items: locals.items.toReversed() });
    expect(root.querySelector('article').dataset.mkSite).toBe(site);
    expect(root.querySelector('article').dataset.key).toBe('[2]');
  });

  it('retains custom plugins and explicit loop keys in both compilation modes', () => {
    const postParse = vi.fn(ast => ast);
    const options = { plugins: [{ postParse }] };
    const source = 'each item in items\n  p(data-key=item.slug)= item.title';
    const locals = { items: [{ id: 1, slug: 'custom', title: 'Title' }] };
    const server = compile(source, options);
    const { body } = compileClient(source, options);
    const client = new Function(`${body}; return template;`)();
    expect(postParse).toHaveBeenCalledTimes(2);
    expect(server(locals)).toContain('data-key="custom"');
    expect(client(locals)).toBe(server(locals));
    expect(options.plugins).toHaveLength(1);
  });

  it('tracks includes and produces an executable Vite module', () => {
    const plugin = mkframePug();
    const context = { addWatchFile: vi.fn() };
    const filename = resolve('tests/fixtures/wrapper.pug');
    const included = resolve('tests/fixtures/list.pug');
    const result = plugin.transform.call(context, 'include list.pug', filename);
    const render = new Function(result.code.replace('export default template;', 'return template;'))();
    expect(render({ title: 'Included', notice: '', posts: [], count: 0 })).toContain('Included');
    expect(context.addWatchFile).toHaveBeenCalledWith(included);
    expect(result.map).toBeNull();
    expect(plugin.transform.call(context, 'export default 1', '/app.js')).toBeUndefined();
  });

  it('invalidates include owners on hot reload and drops dependencies removed by recompilation', () => {
    const plugin = mkframePug();
    const context = { addWatchFile: vi.fn() };
    const filename = resolve('tests/fixtures/wrapper.pug');
    const included = resolve('tests/fixtures/list.pug');
    const module = { id: filename };
    const server = {
      moduleGraph: { getModuleById: vi.fn(() => module), invalidateModule: vi.fn() },
      ws: { send: vi.fn() },
    };
    plugin.transform.call(context, 'include list.pug', filename);
    expect(plugin.handleHotUpdate({ file: included, server })).toEqual([]);
    expect(server.moduleGraph.invalidateModule).toHaveBeenCalledExactlyOnceWith(module);
    expect(server.ws.send).toHaveBeenCalledWith({ type: 'full-reload' });

    plugin.transform.call(context, 'p No includes', filename);
    server.moduleGraph.invalidateModule.mockClear();
    plugin.handleHotUpdate({ file: included, server });
    expect(server.moduleGraph.invalidateModule).not.toHaveBeenCalled();
    server.ws.send.mockClear();
    expect(plugin.handleHotUpdate({ file: '/app.js', server })).toBeUndefined();
    expect(server.ws.send).not.toHaveBeenCalled();
  });
});
