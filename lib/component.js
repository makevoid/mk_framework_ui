import { Renderer } from './dom.js';
import { TW } from './tw.js';
import { ActionBindings } from './component/actions.js';
import { ChildComponents } from './component/children.js';

export class Component {
  constructor({ template, state = {}, props = {}, parent = null, tw = TW, elements = null, onError = console.error } = {}) {
    this.template = template;
    this.state = state;
    this.props = props;
    this.parent = parent;
    this.tw = tw;
    this.onError = onError;
    this.elements = elements;
    this.childComponents = new ChildComponents(this);
    this.actionBindings = new ActionBindings(this);
    this.children = this.childComponents.entries;
    this.listeners = this.actionBindings.listeners;
    this.ready = Promise.resolve();
  }

  mount(root) {
    if (this.root) throw new Error('Component already mounted');
    const target = typeof root === 'string' ? document.querySelector(root) : root;
    if (ActionBindings.owners.has(target)) {
      throw new Error('Another component is already mounted on this element');
    }
    this.renderer = new Renderer(target, {
      preserveChildren: (from, to) => this.childComponents.preserves(from, to),
    });
    this.root = target;
    this.actionBindings.attach(target);
    this.render();
    this.onMount?.();
    return this;
  }

  locals() {
    return { ...this.props, ...this.state, tw: this.tw, props: value => JSON.stringify(value) };
  }

  render() {
    if (!this.root) return;
    this.renderer.render(this.template(this.locals()));
    this.syncElements();
  }

  syncElements() {
    this.ready = this.childComponents.sync();
  }

  createChild(Child, props, name) {
    if (!(Child.prototype instanceof Component)) {
      throw new TypeError(`Component "${name}" must extend MkFrame.Component`);
    }
    const child = new Child({
      props,
      parent: this,
      tw: this.tw,
      elements: this.elements,
      onError: this.onError,
    });
    child.elements ||= this.elements;
    child.parent = this;
    return child;
  }

  setState(update) {
    const changes = typeof update === 'function' ? update(this.state) : update;
    this.state = { ...this.state, ...changes };
    this.render();
    return this;
  }

  setProps(props) {
    const previous = this.props;
    this.props = props;
    this.onPropsChanged?.(previous);
    this.render();
    return this;
  }

  emit(name, detail) {
    if (!this.root) return;
    for (let parent = this.parent; parent; parent = parent.parent) {
      const handler = parent.events?.[name];
      if (typeof handler === 'function') return handler.call(parent, detail, this);
    }
  }

  unmount() {
    if (!this.root) return;
    this.childComponents.clear();
    this.onUnmount?.();
    this.actionBindings.detach();
    this.root.replaceChildren();
    this.root = null;
    this.renderer = null;
    this.parent = null;
  }
}
