import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { compile, compileClient } from '../lib/pug/index.js';
import { DomState } from '../lib/dom/state.js';
import { Renderer, Component } from '../lib/index.js';
const list = compile(readFileSync('tests/fixtures/list.pug', 'utf8'), { filename: 'list.pug' });
const detail = compile(readFileSync('tests/fixtures/detail.pug', 'utf8'), { filename: 'detail.pug' });
let root;
const posts = [{ id: 1, title: 'First' }, { id: 2, title: 'Second' }, { id: 3, title: 'Third' }];
const state = { title: 'Journal', notice: '', count: 0, posts };
beforeEach(() => { document.body.innerHTML = '<div id="app"></div>'; root = document.querySelector('#app'); });

describe('Pug renderer (framework fixtures)', () => {
  it('assigns unique IDs to every element and patches only changed nodes', () => {
    const renderer = new Renderer(root); renderer.render(list(state));
    const nodes = [...root.querySelectorAll('*')]; const ids = nodes.map(n => n.id);
    expect(ids.every(Boolean)).toBe(true); expect(new Set(ids).size).toBe(ids.length);
    renderer.render(list({ ...state, title: 'Updated' }));
    expect(root.querySelector('h1').textContent).toBe('Updated');
    expect([...root.querySelectorAll('*')].every((n, i) => n === nodes[i])).toBe(true);
    expect([...root.querySelectorAll('*')].map(n => n.id)).toEqual(ids);
  });
  it('reuses record nodes on reorder, insertion, update and removal, preserving focus and selection', () => {
    const renderer = new Renderer(root); renderer.render(list(state));
    const first = root.querySelector('[data-post="1"]'); const second = root.querySelector('[data-post="2"]');
    const input = second.querySelector('input'); input.value = 'my draft'; input.focus(); input.setSelectionRange(2, 5);
    renderer.render(list({ ...state, posts: [posts[2], { ...posts[1], title: 'Changed' }, { id: 4, title: 'Fourth' }] }));
    expect(root.querySelector('[data-post="2"]')).toBe(second); expect(second.querySelector('strong').textContent).toBe('Changed');
    expect(second.querySelector('input')).toBe(input); expect(input.value).toBe('my draft'); expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]); expect(first.isConnected).toBe(false);
    expect([...root.querySelectorAll('li')].map(n => n.dataset.post)).toEqual(['3', '2', '4']);
  });
  it('preserves static sibling identity around conditionals', () => {
    const renderer = new Renderer(root); renderer.render(list(state)); const stable = root.querySelector('.stable');
    renderer.render(list({ ...state, notice: 'New notice' })); expect(root.querySelector('.stable')).toBe(stable);
  });
  it('diffs the second template, escapes HTML and resets forms when the record changes', () => {
    const renderer = new Renderer(root);
    renderer.render(detail({ post: { id: 1, title: 'Hello', description: 'Intro' }, comments: [{ id: 8, author: 'Alice', content: 'Nice' }] }));
    const comment = root.querySelector('[data-comment="8"]'); const field = root.querySelector('input'); field.value = 'Unsaved';
    renderer.render(detail({ post: { id: 1, title: 'Hello', description: '<script>bad()</script>' }, comments: [{ id: 9, author: 'Bob', content: 'New' }, { id: 8, author: 'Alice', content: 'Updated' }] }));
    expect(root.querySelector('[data-comment="8"]')).toBe(comment); expect(comment.querySelector('p').textContent).toBe('Updated');
    expect(root.querySelector('script')).toBeNull(); expect(root.querySelector('input').value).toBe('Unsaved');
    renderer.render(detail({ post: { id: 2, title: 'Other', description: 'Other' }, comments: [] }));
    expect(root.querySelector('input')).not.toBe(field); expect(root.querySelector('input').value).toBe('Other');
  });
  it('scopes repeated records across nested lists and renderer instances', () => {
    const template = compile('main\n  each group in groups\n    section\n      each post in group.posts\n        p= post.title');
    new Renderer(root).render(template({ groups: [{ id: 'a', posts }, { id: 'b', posts }] }));
    const other = document.createElement('div'); document.body.append(other);
    new Renderer(other).render(template({ groups: [{ id: 'a', posts }] }));
    const ids = [...document.querySelectorAll('[data-mk-node]')].map(n => n.id); expect(new Set(ids).size).toBe(ids.length);
  });
  it('rejects duplicate keys before mutating the DOM', () => {
    const renderer = new Renderer(root); renderer.render(list(state)); const before = root.innerHTML;
    expect(() => renderer.render(list({ ...state, posts: [posts[0], posts[0]] }))).toThrow('Duplicate data-key'); expect(root.innerHTML).toBe(before);
  });
  it('supports explicit keys for records without ids', () => {
    const template = compile('ul\n  each row in rows\n    li(data-key=row.slug)= row.name');
    const rows = [{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }]; const renderer = new Renderer(root);
    renderer.render(template({ rows })); const node = root.querySelector('li'); renderer.render(template({ rows: rows.toReversed() }));
    expect(root.querySelector('li:last-child')).toBe(node);
  });
  it('updates controlled values while preserving uncontrolled select and checkbox state', () => {
    const template = compile('div\n  input(data-controlled value=value)\n  input(type="checkbox")\n  select\n    option(value="a") A\n    option(value="b") B');
    const renderer = new Renderer(root); renderer.render(template({ value: 'old' })); root.querySelector('[type="checkbox"]').checked = true; root.querySelector('select').value = 'b';
    renderer.render(template({ value: 'new' })); expect(root.querySelector('input').value).toBe('new'); expect(root.querySelector('[type="checkbox"]').checked).toBe(true); expect(root.querySelector('select').value).toBe('b');
  });
  it('retains the default selection when asynchronous options are appended', () => {
    const template = compile('select\n  option(value="") All categories\n  each category in categories\n    option(data-key=category value=category)= category');
    const renderer = new Renderer(root); renderer.render(template({ categories: [] }));
    const field = root.querySelector('select');
    renderer.render(template({ categories: ['phones', 'laptops'] }));
    expect(field.selectedIndex).toBe(0);
    expect(field.selectedOptions[0].textContent).toBe('All categories');
    field.value = 'laptops';
    renderer.render(template({ categories: ['phones', 'laptops', 'tablets'] }));
    expect(field.value).toBe('laptops');
  });
  it('preserves file selections without assigning a forbidden filename value', () => {
    const from = document.createElement('input'); from.type = 'file';
    const to = document.createElement('input'); to.type = 'file';
    // jsdom cannot choose a file; emulate its browser-provided filename while
    // retaining a genuine FileList. A real file selection requires a browser.
    Object.defineProperty(from, 'value', { get: () => 'C:\\fakepath\\photo.webp' });
    expect(() => new DomState(root).preserveField(from, to)).not.toThrow();
    expect(to.files).toBe(from.files);
    const template = compile('input(type="file" disabled=busy)');
    const renderer = new Renderer(root); renderer.render(template({ busy: false }));
    const field = root.querySelector('input');
    renderer.render(template({ busy: true }));
    expect(root.querySelector('input')).toBe(field);
    expect(field.disabled).toBe(true);
  });
  it('compiles browser templates without a runtime compiler', () => {
    const { body } = compileClient('h1= title', { filename: 'client.pug' });
    const template = new Function(`${body}; return template;`)(); expect(template({ title: '<safe>' })).toContain('&lt;safe&gt;');
  });
});
describe('Component lifecycle primitives', () => {
  it('delegates actions once across patches and removes listeners on unmount', () => {
    class Counter extends Component { actions = { increment() { this.setState(s => ({ count: s.count + 1 })); } }; }
    const component = new Counter({ template: list, state }).mount(root); const button = root.querySelector('button'); button.click(); button.click();
    expect(component.state.count).toBe(2); expect(root.querySelector('button')).toBe(button); component.unmount(); button.click(); expect(component.state.count).toBe(2); expect(root.children.length).toBe(0);
  });
  it('reports async action failures and ignores unexposed method names', async () => {
    const error = new Error('failed'); const onError = vi.fn(); const component = new Component({ template: list, state, onError });
    component.actions = { increment: async () => { throw error; } }; component.mount(root); root.querySelector('button').click(); await Promise.resolve(); expect(onError).toHaveBeenCalledWith(error);
    root.querySelector('button').dataset.click = 'unmount'; root.querySelector('button').click(); expect(component.root).toBe(root);
  });
});
