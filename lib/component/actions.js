const actionTypes = ['click', 'input', 'change', 'submit'];

// Shared ownership keeps bubbling DOM events within their mounted component.
export class ActionBindings {
  static owners = new WeakMap();

  static ownerOf(element) {
    for (let node = element; node; node = node.parentElement) {
      const owner = this.owners.get(node);
      if (owner) return owner;
    }
  }

  constructor(component) {
    this.component = component;
    this.listeners = [];
  }

  attach(root) {
    this.root = root;
    ActionBindings.owners.set(root, this.component);
    for (const type of actionTypes) {
      const listener = event => this.dispatch(event);
      root.addEventListener(type, listener);
      this.listeners.push([type, listener]);
    }
  }

  dispatch(event) {
    const attribute = `data-${event.type}`;
    const element = event.target.closest?.(`[${attribute}]`);
    if (!element || !this.root.contains(element)) return;
    if (ActionBindings.ownerOf(element) !== this.component) return;

    // Only methods explicitly exposed in actions are callable from markup.
    const name = element.getAttribute(attribute);
    const action = this.component.actions?.[name];
    if (typeof action !== 'function') return;
    if (event.type === 'submit') event.preventDefault();

    try {
      const result = action.call(this.component, event, element);
      Promise.resolve(result).catch(error => this.component.onError(error));
    } catch (error) {
      this.component.onError(error);
    }
  }

  detach() {
    for (const [type, listener] of this.listeners) {
      this.root.removeEventListener(type, listener);
    }
    this.listeners.length = 0;
    ActionBindings.owners.delete(this.root);
    this.root = null;
  }
}
