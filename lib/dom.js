import morphdom from 'morphdom';
import { NodeIdentities } from './dom/identities.js';
import { DomState } from './dom/state.js';

export class Renderer {
  constructor(root, { preserveChildren = () => false } = {}) {
    if (!root?.ownerDocument) throw new TypeError('Renderer requires a DOM element');
    this.root = root;
    this.nodeIdentities = new NodeIdentities();
    this.preserveChildren = preserveChildren;
  }

  render(html) {
    const target = this.root.cloneNode(false);
    target.innerHTML = html;
    // Validate the complete target before touching the live DOM.
    const identities = this.nodeIdentities.prepare(target);
    const state = new DomState(this.root);
    this.patch(target, state);
    this.nodeIdentities.commit(identities);
    state.restoreFocus();
    return this.root;
  }

  patch(target, state) {
    morphdom(this.root, target, {
      childrenOnly: true,
      getNodeKey: node => node.getAttribute?.('data-mk-node') || node.id,
      onBeforeElChildrenUpdated: (from, to) => !this.preserveChildren(from, to),
      onBeforeElUpdated: (from, to) => {
        state.preserveField(from, to);
        if (from.hasAttribute('data-mk-ignore')) return false;
        return !from.isEqualNode(to);
      },
    });
  }
}
