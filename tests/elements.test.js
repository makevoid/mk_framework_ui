import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, elements } from '../lib/index.js';
import { compile } from '../lib/pug/index.js';

const childTemplate = compile('section\n  button(data-click="increment")= count\n  input(aria-label="Draft")');
class Child extends Component {
  constructor(options = {}) { super({ ...options, template: childTemplate, state: { count: 0 } }); }
  actions = { increment() { this.setState(s => ({ count: s.count + 1 })); } };
}
const parentTemplate = compile('main\n  h1= title\n  each record in records\n    div(data-element=record.element data-record=record.id)');
let root;
beforeEach(() => { document.body.innerHTML = '<div id="app"></div>'; root = document.querySelector('#app'); });
function parent(registry, state = {}) {
  return new Component({ template: parentTemplate, elements: registry, state: { title: 'Parent', records: [{ id: 1, element: 'Child' }], ...state } });
}

describe('Declarative component modules', () => {
  it('loads a file lazily and mounts independent instances while importing the module once', async () => {
    const load = vi.fn(async () => ({ default: Child }));
    const registry = elements({ './components/child.js': load });
    expect(load).not.toHaveBeenCalled();
    const app = parent(registry, { records: [{ id: 1, element: 'Child' }, { id: 2, element: 'Child' }] }).mount(root);
    await app.ready;
    expect(load).toHaveBeenCalledTimes(1);
    const buttons = root.querySelectorAll('button'); buttons[0].click();
    expect([...buttons].map(button => button.textContent)).toEqual(['1', '0']);
    const ids = [...root.querySelectorAll('*')].map(node => node.id);
    expect(ids.every(Boolean)).toBe(true); expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves child state, DOM identity, input and focus through parent patches and keyed moves', async () => {
    const app = parent(elements({ './components/child.js': async () => ({ default: Child }) }), {
      records: [{ id: 1, element: 'Child' }, { id: 2, element: 'Child' }],
    }).mount(root);
    await app.ready;
    const host = root.querySelector('[data-record="1"]'); const button = host.querySelector('button');
    button.click(); const input = host.querySelector('input'); input.value = 'draft'; input.focus(); input.setSelectionRange(1, 3);
    app.setState(s => ({ title: 'Updated parent', records: s.records.toReversed() })); await app.ready;
    expect(root.querySelector('[data-record="1"]')).toBe(host); expect(host.querySelector('button')).toBe(button);
    expect(button.textContent).toBe('1'); expect(input.value).toBe('draft'); expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
    expect(root.querySelector('h1').textContent).toBe('Updated parent');
  });

  it('isolates child actions even when the parent exposes the same action name', async () => {
    const app = parent(elements({ './components/child.js': async () => ({ default: Child }) }));
    const increment = vi.fn(); app.actions = { increment }; app.mount(root); await app.ready;
    root.querySelector('button').click(); expect(increment).not.toHaveBeenCalled(); expect(root.querySelector('button').textContent).toBe('1');
  });

  it('unmounts removed children once and releases their delegated listeners', async () => {
    const unmounted = vi.fn(); class Disposable extends Child { onUnmount() { unmounted(); } }
    const app = parent(elements({ './components/child.js': async () => ({ default: Disposable }) })).mount(root); await app.ready;
    const host = root.querySelector('[data-element]'); const child = app.children.get(host).component;
    const button = host.querySelector('button'); app.setState({ records: [] });
    expect(unmounted).toHaveBeenCalledTimes(1); expect(child.root).toBeNull(); button.click(); expect(child.state.count).toBe(0);
    app.unmount(); app.unmount(); expect(unmounted).toHaveBeenCalledTimes(1);
  });

  it('disposes and remounts a host when data-element changes', async () => {
    const unmounted = vi.fn(); class First extends Child { onUnmount() { unmounted(); } }
    class Second extends Child { constructor(options) { super(options); this.state.count = 9; } }
    const app = parent(elements({ './components/child.js': async () => ({ default: First }), './components/second.js': async () => ({ default: Second }) })).mount(root);
    await app.ready; app.setState({ records: [{ id: 1, element: 'Second' }] }); await app.ready;
    expect(unmounted).toHaveBeenCalledTimes(1); expect(root.querySelector('button').textContent).toBe('9');
  });

  it('does not mount or report errors from an import after its host has been removed', async () => {
    let resolve; const mounted = vi.fn(); class Delayed extends Child { onMount() { mounted(); } }
    const load = vi.fn(() => new Promise(done => { resolve = done; }));
    const app = parent(elements({ './components/child.js': load })).mount(root);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const pending = app.ready; app.setState({ records: [] }); resolve({ default: Delayed }); await pending;
    expect(mounted).not.toHaveBeenCalled(); expect(root.querySelector('[data-element]')).toBeNull();
  });

  it('invalidates pending imports when the parent unmounts', async () => {
    let reject; const load = vi.fn(() => new Promise((_resolve, fail) => { reject = fail; }));
    const app = parent(elements({ './components/child.js': load })); app.onError = vi.fn(); app.mount(root);
    await vi.waitFor(() => expect(load).toHaveBeenCalled()); const pending = app.ready; app.unmount();
    reject(new Error('Late network failure')); await pending; expect(app.onError).not.toHaveBeenCalled(); expect(root.children).toHaveLength(0);
  });

  it('passes the registry into nested components and recursively waits for and disposes them', async () => {
    const unmounted = vi.fn(); class Leaf extends Child { onUnmount() { unmounted(); } }
    class Branch extends Component { constructor(options) { super({ ...options, template: compile('aside\n  div(data-element="Leaf")') }); } }
    const app = parent(elements({ './components/child.js': async () => ({ default: Branch }), './components/leaf.js': async () => ({ default: Leaf }) })).mount(root);
    await app.ready; expect(root.querySelectorAll('button')).toHaveLength(1);
    app.setState({ title: 'Still here' }); await app.ready; expect(root.querySelectorAll('button')).toHaveLength(1);
    app.unmount(); expect(unmounted).toHaveBeenCalledTimes(1);
  });

  it('reports unregistered names and invalid component exports through onError', async () => {
    const app = parent(elements({})); app.onError = vi.fn(); app.mount(root); await app.ready;
    expect(app.onError.mock.calls[0][0].message).toContain('Unknown data-element'); app.unmount();
    const invalid = parent(elements({ './components/child.js': async () => ({ default: class {} }) })); invalid.onError = vi.fn(); invalid.mount(root); await invalid.ready;
    expect(invalid.onError.mock.calls[0][0].message).toContain('must extend MkFrame.Component');
  });

  it('matches PascalCase names to kebab/snake filenames and rejects ambiguous or unsafe names', async () => {
    const registry = elements({ './components/post-counter.js': async () => ({ default: Child }) });
    expect(await registry.load('PostCounter')).toBe(Child);
    await expect(registry.load('../secret')).rejects.toThrow('Invalid data-element');
    expect(() => elements({ './a/counter.js': () => {}, './b/counter.js': () => {} })).toThrow('Ambiguous');
  });
});

describe('Props and component events', () => {
  const hostTemplate = compile('main\n  div(data-element="Child" data-props=props({ title, busy }))');
  class WithProps extends Component {
    constructor(options) {
      super({ ...options, template: compile('section\n  h2= title\n  button(data-click="save" disabled=busy)= count\n  input(aria-label="Draft")'), state: { count: 0 } });
    }
    actions = { save() { this.setState(s => ({ count: s.count + 1 })); return this.emit('item:save', { title: this.props.title }); } };
  }
  it('updates props without resetting local state, input drafts or element identity', async () => {
    const app = new Component({ template: hostTemplate, elements: elements({ './components/child.js': async () => ({ default: WithProps }) }), state: { title: 'First', busy: false } }).mount(root);
    await app.ready; const host = root.querySelector('[data-element]'); const child = app.children.get(host).component;
    const button = host.querySelector('button'); button.click(); const input = host.querySelector('input'); input.value = 'draft';
    app.setState({ title: 'Updated', busy: true }); await app.ready;
    expect(app.children.get(host).component).toBe(child); expect(host.querySelector('button')).toBe(button);
    expect(button.textContent).toBe('1'); expect(button.disabled).toBe(true); expect(host.querySelector('h2').textContent).toBe('Updated'); expect(input.value).toBe('draft');
  });
  it('reads the latest props when a lazy module resolves after a parent update', async () => {
    let resolve; const load = vi.fn(() => new Promise(done => { resolve = done; }));
    const app = new Component({ template: hostTemplate, elements: elements({ './components/child.js': load }), state: { title: 'Old', busy: false } }).mount(root);
    await vi.waitFor(() => expect(load).toHaveBeenCalled()); app.setState({ title: 'Latest' }); resolve({ default: WithProps }); await app.ready;
    expect(root.querySelector('h2').textContent).toBe('Latest');
  });
  it('forwards events to the nearest ancestor handler, with detail, source and return value', async () => {
    class Middle extends Component {
      constructor(options) { super({ ...options, template: compile('div(data-element="Leaf" data-props=props({ title: "Nested", busy: false }))') }); }
    }
    const app = parent(elements({ './components/child.js': async () => ({ default: Middle }), './components/leaf.js': async () => ({ default: WithProps }) }));
    const save = vi.fn(() => Promise.resolve('saved')); app.events = { 'item:save': save }; app.mount(root); await app.ready;
    const middle = [...app.children.values()][0].component; const child = [...middle.children.values()][0].component;
    expect(await child.emit('item:save', { title: 'Nested' })).toBe('saved');
    expect(save).toHaveBeenCalledWith({ title: 'Nested' }, child); expect(save.mock.contexts[0]).toBe(app);
    const nearer = vi.fn(() => 'handled'); middle.events = { 'item:save': nearer };
    expect(child.emit('item:save', {})).toBe('handled'); expect(save).toHaveBeenCalledTimes(1);
    app.unmount(); child.emit('item:save', {}); expect(nearer).toHaveBeenCalledTimes(1);
  });
  it('escapes serialized props and rejects non-object JSON', async () => {
    const title = '<img src=x onerror=alert(1)> " &';
    const app = new Component({ template: hostTemplate, elements: elements({ './components/child.js': async () => ({ default: WithProps }) }), state: { title, busy: false } }).mount(root);
    await app.ready; expect(root.querySelector('h2').textContent).toBe(title); expect(root.querySelector('img')).toBeNull(); app.unmount();
    const onError = vi.fn(); const invalid = new Component({ template: compile('div(data-element="Child" data-props="[]")'), elements: app.elements, onError }).mount(root);
    await invalid.ready; expect(onError.mock.calls[0][0].message).toContain('JSON object');
  });
  it('waits for nested children introduced by a prop update', async () => {
    class Switch extends Component {
      constructor(options) { super({ ...options, template: compile('section\n  if busy\n    div(data-element="Leaf")') }); }
    }
    const app = new Component({ template: hostTemplate, elements: elements({ './components/child.js': async () => ({ default: Switch }), './components/leaf.js': async () => ({ default: Child }) }), state: { title: '', busy: false } }).mount(root);
    await app.ready; expect(root.querySelector('button')).toBeNull(); app.setState({ busy: true }); await app.ready; expect(root.querySelector('button')).not.toBeNull();
  });
  it('routes rejected event handlers through the child action error boundary', async () => {
    const onError = vi.fn(); const error = new Error('Save failed');
    const app = new Component({ template: hostTemplate, elements: elements({ './components/child.js': async () => ({ default: WithProps }) }), state: { title: 'First', busy: false }, onError });
    app.events = { 'item:save': async () => { throw error; } }; app.mount(root); await app.ready; root.querySelector('button').click();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
  });
});
