import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MkFrame from '../lib/index.js';
import { compile } from '../lib/pug/index.js';

const editorTemplate = compile(`
form(data-submit='save')
  h2= item.title
  input(name='title' value=item.title data-input='edit' aria-label='Title')
  button(type='submit' disabled=busy class=tw.button()) Save
  output= edits
`, { filename: 'editor.pug' });

const applicationTemplate = compile(`
main
  h1= title
  if error
    p(role='alert')= error
  if item
    section(data-element='Editor' data-key=item.id data-props=props({ item, busy }))
`, { filename: 'application.pug' });

class ItemsApi extends MkFrame.API.Resource {
  static path = '/items';
}

class Editor extends MkFrame.Component {
  constructor(options) {
    super({ ...options, template: editorTemplate, state: { edits: 0 } });
  }

  actions = {
    edit() {
      this.setState(state => ({ edits: state.edits + 1 }));
    },
    save(event, form) {
      return this.emit('item:save', {
        id: this.props.item.id,
        data: Object.fromEntries(new FormData(form)),
      });
    },
  };
}

class Application extends MkFrame.Component {
  constructor({ api, browser, elements, onError }) {
    super({
      template: applicationTemplate,
      elements,
      onError,
      state: { title: 'Items', item: null, busy: false, error: '' },
    });
    this.api = api;
    this.router = new MkFrame.Router({
      window: browser,
      notFound: () => this.setState({ title: 'Not found', item: null }),
    });
    this.router.onError = this.onError;
    this.router.route('/items/:id', context => this.load(context));
  }

  onMount() {
    this.router.start();
  }

  onUnmount() {
    this.router.stop();
  }

  async load({ params, query, signal }) {
    const { item } = await this.api.show({ id: params.id, query: Object.fromEntries(query), signal });
    if (!signal.aborted) this.setState({ item, error: '' });
  }

  events = {
    async 'item:save'({ id, data }) {
      this.setState({ busy: true, error: '' });
      try {
        const { item } = await this.api.update({ id, data });
        this.setState({ item });
      } catch (error) {
        this.setState({ error: error.message });
        throw error;
      } finally {
        this.setState({ busy: false });
      }
    },
  };
}

// Only the browser boundary and HTTP transport are substituted. Rendering,
// template compilation, routing, lazy children and events use the real framework.
class HashWindow extends EventTarget {
  location = { hash: '#/items/1?include=details' };

  visit(path) {
    this.location.hash = `#${path}`;
    this.dispatchEvent(new Event('hashchange'));
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function response(data, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(data) };
}

let root;
let app;
let browser;
let fetch;
let onError;
let loader;

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector('#app');
  browser = new HashWindow();
  fetch = vi.fn().mockResolvedValue(response({ item: { id: 1, title: 'First' } }));
  onError = vi.fn();
  loader = vi.fn(async () => ({ default: Editor }));
  app = new Application({
    api: new ItemsApi({ fetch, baseURL: '/api' }),
    browser,
    elements: MkFrame.elements({ './components/editor.js': loader }),
    onError,
  });
});

afterEach(() => {
  app.unmount();
  vi.restoreAllMocks();
});

async function mountEditor() {
  app.mount('#app');
  // ready covers the current render's children, not an outstanding route request.
  await vi.waitFor(() => expect(app.state.item?.id).toBe(1));
  await app.ready;
  return root.querySelector('input');
}

function submit() {
  const event = new Event('submit', { bubbles: true, cancelable: true });
  root.querySelector('form').dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
}

describe('Framework application flow', () => {
  it('loads a route and saves child form data through the parent resource without losing the draft', async () => {
    const input = await mountEditor();
    expect(fetch.mock.calls[0]).toEqual([
      '/api/items/1?include=details',
      expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) }),
    ]);
    expect(root.querySelector('button').className).toContain('bg-emerald-800');

    input.value = 'Edited title';
    input.focus();
    input.setSelectionRange(1, 5);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const save = deferred();
    fetch.mockReturnValueOnce(save.promise);
    submit();

    expect(root.querySelector('button').disabled).toBe(true);
    expect(fetch.mock.calls[1]).toEqual([
      '/api/items/1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ title: 'Edited title' }) }),
    ]);
    save.resolve(response({ item: { id: 1, title: 'Server title' } }));
    await vi.waitFor(() => expect(app.state.busy).toBe(false));
    await app.ready;

    expect(root.querySelector('h2').textContent).toBe('Server title');
    expect(root.querySelector('input')).toBe(input);
    expect(input.value).toBe('Edited title');
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 5]);
    expect(root.querySelector('output').textContent).toBe('1');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports API validation through the child action and allows a successful retry', async () => {
    const input = await mountEditor();
    input.value = 'My draft';
    fetch.mockResolvedValueOnce(response({ error: 'Title is required', details: { title: ['required'] } }, 422));
    submit();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      name: 'ApiError', status: 422, data: { error: 'Title is required', details: { title: ['required'] } },
    }));
    expect(root.querySelector('[role="alert"]').textContent).toBe('Title is required');
    expect(root.querySelector('input')).toBe(input);
    expect(input.value).toBe('My draft');
    expect(root.querySelector('button').disabled).toBe(false);

    fetch.mockResolvedValueOnce(response({ item: { id: 1, title: 'Saved' } }));
    submit();
    await vi.waitFor(() => expect(app.state.item.title).toBe('Saved'));
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('input')).toBe(input);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('cancels stale route work and disposes the previous keyed editor when the record changes', async () => {
    const input = await mountEditor();
    const unmount = vi.spyOn(Editor.prototype, 'unmount');
    const dispatch = vi.spyOn(app.router, 'dispatch');
    const slow = deferred();
    fetch.mockReturnValueOnce(slow.promise);
    browser.visit('/items/2');
    const pendingNavigation = dispatch.mock.results.at(-1).value;
    const slowSignal = fetch.mock.calls.at(-1)[1].signal;
    fetch.mockResolvedValueOnce(response({ item: { id: 3, title: 'Third' } }));
    browser.visit('/items/3');
    await vi.waitFor(() => expect(app.state.item.id).toBe(3));
    await app.ready;

    slow.resolve(response({ item: { id: 2, title: 'Late result' } }));
    await pendingNavigation;
    expect(slowSignal.aborted).toBe(true);
    expect(root.querySelector('h2').textContent).toBe('Third');
    expect(input.isConnected).toBe(false);
    expect(root.querySelector('input').value).toBe('Third');
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('stops routing, child actions and pending requests on unmount, then supports mounting again', async () => {
    const input = await mountEditor();
    const form = root.querySelector('form');
    const slow = deferred();
    fetch.mockReturnValueOnce(slow.promise);
    browser.visit('/items/2');
    const signal = fetch.mock.calls.at(-1)[1].signal;
    app.unmount();
    app.unmount();

    expect(signal.aborted).toBe(true);
    expect(root.children).toHaveLength(0);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    browser.visit('/items/1');
    expect(fetch).toHaveBeenCalledTimes(2);
    slow.reject(new DOMException('Aborted', 'AbortError'));

    fetch.mockResolvedValueOnce(response({ item: { id: 1, title: 'Reloaded' } }));
    app.mount(root);
    await vi.waitFor(() => expect(app.state.item.title).toBe('Reloaded'));
    await app.ready;
    expect(root.querySelector('input')).not.toBe(input);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
