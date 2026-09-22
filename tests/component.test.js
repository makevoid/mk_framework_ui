import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, elements } from '../lib/index.js';
import { compile } from '../lib/pug/index.js';

let root;
const mounted = [];

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.querySelector('#app');
});

afterEach(() => {
  for (const component of mounted.splice(0)) component.unmount();
});

function mount(options) {
  const component = new Component(options);
  mounted.push(component);
  return component.mount(root);
}

describe('Component lifecycle contract', () => {
  it('merges state synchronously, replaces props and invokes lifecycle hooks with the component receiver', () => {
    const previousProps = { title: 'From props', extra: 'old' };
    const component = new Component({
      template: compile('h1= title\np= count'),
      props: previousProps,
      state: { title: 'From state', count: 0 },
    });
    mounted.push(component);
    component.onMount = vi.fn(function () {
      expect(this.root.querySelector('h1').textContent).toBe('From state');
    });
    component.onPropsChanged = vi.fn(function (previous) {
      expect(previous).toBe(previousProps);
      expect(this.props).toEqual({ title: 'New props' });
    });
    component.onUnmount = vi.fn(function () {
      expect(this.root).toBe(root);
    });

    expect(component.mount('#app')).toBe(component);
    expect(component.setState(state => ({ count: state.count + 1 }))).toBe(component);
    expect(root.querySelector('p').textContent).toBe('1');
    expect(component.setProps({ title: 'New props' })).toBe(component);
    expect(root.querySelector('h1').textContent).toBe('From state');
    expect(component.onPropsChanged).toHaveBeenCalledTimes(1);
    component.unmount();
    component.unmount();
    expect(component.onMount).toHaveBeenCalledTimes(1);
    expect(component.onUnmount).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['click', 'button(data-click="handle")\n  span Click', 'span'],
    ['input', 'input(data-input="handle")', 'input'],
    ['change', 'select(data-change="handle")\n  option A', 'select'],
    ['submit', 'form(data-submit="handle")', 'form'],
  ])('delegates %s with the matching element and releases the listener on unmount', (type, source, selector) => {
    const component = mount({ template: compile(source) });
    const handle = vi.fn();
    component.actions = { handle };
    const target = root.querySelector(selector);
    const actionElement = target.closest(`[data-${type}]`);
    const event = new Event(type, { bubbles: true, cancelable: true });
    target.dispatchEvent(event);

    expect(handle).toHaveBeenCalledExactlyOnceWith(event, actionElement);
    expect(handle.mock.contexts[0]).toBe(component);
    expect(event.defaultPrevented).toBe(type === 'submit');
    component.unmount();
    target.dispatchEvent(new Event(type, { bubbles: true }));
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid and already-owned roots without taking over another component', () => {
    const component = new Component({ template: compile('p Original') });
    mounted.push(component);
    expect(() => component.mount('#missing')).toThrow('DOM element');
    component.mount(root);
    expect(() => component.mount(root)).toThrow('already mounted');
    const second = new Component({ template: compile('p Replacement') });
    mounted.push(second);
    expect(() => second.mount(root)).toThrow('Another component');
    expect(root.textContent).toBe('Original');
    component.unmount();
    second.mount(root);
    expect(root.textContent).toBe('Replacement');
  });

  it('skips unchanged child props and passes inherited theme and errors to descendants', async () => {
    const changed = vi.fn();
    const onError = vi.fn();
    const theme = { label: () => 'custom-label' };
    class Child extends Component {
      constructor(options) {
        super({ ...options, template: compile('p(class=tw.label())= title') });
      }
      onPropsChanged(previous) {
        changed(previous);
      }
    }
    const app = mount({
      template: compile('h1= heading\ndiv(data-element="Child" data-props=props({ title }))'),
      state: { heading: 'Before', title: 'Child' },
      elements: elements({ './child.js': async () => ({ default: Child }) }),
      tw: theme,
      onError,
    });
    await app.ready;
    const host = root.querySelector('[data-element]');
    const child = app.children.get(host).component;
    const render = vi.spyOn(child, 'render');
    app.setState({ heading: 'After' });
    await app.ready;
    expect(render).not.toHaveBeenCalled();
    expect(child.tw).toBe(theme);
    expect(child.onError).toBe(onError);
    expect(root.querySelector('p').className).toBe('custom-label');

    app.setState({ title: 'Updated' });
    await app.ready;
    expect(changed).toHaveBeenCalledExactlyOnceWith({ title: 'Child' });
    expect(render).toHaveBeenCalledTimes(1);
    expect(root.querySelector('p').textContent).toBe('Updated');
  });

  it('shares in-flight module loads and retries after a failed import', async () => {
    class Child extends Component {}
    const failure = new Error('Temporary load failure');
    const loader = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ default: Child });
    const registry = elements({ './child.js': loader });
    const first = registry.load('Child');
    expect(registry.load('Child')).toBe(first);
    await expect(first).rejects.toBe(failure);
    await expect(registry.load('Child')).resolves.toBe(Child);
    await expect(registry.load('Child')).resolves.toBe(Child);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
