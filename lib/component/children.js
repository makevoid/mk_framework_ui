// Each host owns one lazy component lifecycle, including imports still in flight.
class ChildElement {
  constructor(collection, host) {
    this.collection = collection;
    this.parent = collection.parent;
    this.host = host;
    this.name = host.dataset.element;
    this.component = null;
    this.propsText = this.serializedProps;
  }

  get active() {
    return this.collection.entries.get(this.host) === this && this.parent.root?.contains(this.host);
  }

  get serializedProps() {
    return this.host.getAttribute('data-props') || '{}';
  }

  readProps() {
    const props = JSON.parse(this.serializedProps);
    if (!props || typeof props !== 'object' || Array.isArray(props)) {
      throw new TypeError('data-props must contain a JSON object');
    }
    return props;
  }

  async mount() {
    try {
      // Let the collection register this entry before resolving a module.
      await Promise.resolve();
      if (!this.active) return;
      if (!this.parent.elements) {
        throw new Error('data-element requires an elements registry: MkFrame.elements(import.meta.glob("./components/*.js"))');
      }
      const Child = await this.parent.elements.load(this.name);
      if (!this.active) return;

      // Props may have changed while the module was loading.
      this.propsText = this.serializedProps;
      this.component = this.parent.createChild(Child, this.readProps(), this.name);
      this.component.mount(this.host);
      await this.component.ready;
    } catch (error) {
      if (this.active) this.parent.onError(error);
    }
  }

  update() {
    if (!this.component || this.propsText === this.serializedProps) return;
    this.propsText = this.serializedProps;
    try {
      this.component.setProps(this.readProps());
      this.ready = this.component.ready;
    } catch (error) {
      this.parent.onError(error);
    }
  }

  unmount() {
    this.component?.unmount();
  }
}

export class ChildComponents {
  constructor(parent) {
    this.parent = parent;
    this.entries = new Map();
  }

  owns(host) {
    const ancestor = host.parentElement.closest('[data-element]');
    return !ancestor || ancestor === this.parent.root || !this.parent.root.contains(ancestor);
  }

  preserves(from, to) {
    return this.entries.get(from)?.name === to.getAttribute('data-element');
  }

  sync() {
    const hosts = [...this.parent.root.querySelectorAll('[data-element]')].filter(host => this.owns(host));
    this.removeMissing(new Set(hosts));
    for (const host of hosts) {
      const existing = this.entries.get(host);
      if (existing) {
        existing.update();
      } else {
        const entry = new ChildElement(this, host);
        this.entries.set(host, entry);
        entry.ready = entry.mount();
      }
    }
    return Promise.all([...this.entries.values()].map(entry => entry.ready)).then(() => undefined);
  }

  removeMissing(hosts) {
    for (const [host, entry] of this.entries) {
      if (hosts.has(host) && host.dataset.element === entry.name) continue;
      // Invalidate first so a pending import cannot mount during disposal.
      this.entries.delete(host);
      entry.unmount();
    }
  }

  clear() {
    const entries = [...this.entries.values()];
    this.entries.clear();
    for (const entry of entries) entry.unmount();
  }
}
