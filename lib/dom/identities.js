let nextRoot = 0;

export class NodeIdentities {
  constructor() {
    this.prefix = `mk-${++nextRoot}`;
    this.serial = 0;
    this.current = new Map();
  }

  prepare(root) {
    const identities = new Map();
    this.visit(root, this.prefix, identities, new Set());
    return identities;
  }

  visit(parent, path, identities, ids) {
    const siblings = new Map();
    for (const element of parent.children) {
      const key = element.getAttribute('data-key');
      const site = element.getAttribute('data-mk-site') || element.tagName;
      const explicit = element.getAttribute('id');
      const token = JSON.stringify([site, explicit, key]);
      const count = siblings.get(token) || 0;
      if (count && key !== null) throw new Error(`Duplicate data-key ${key} at ${site}`);
      siblings.set(token, count + 1);

      const identity = `${path}/${token}:${count}`;
      const nodeKey = this.current.get(identity) || `${this.prefix}-${++this.serial}`;
      const id = explicit || nodeKey;
      if (ids.has(id)) throw new Error(`Duplicate element id: ${id}`);
      ids.add(id);
      identities.set(identity, nodeKey);
      element.id = id;
      element.setAttribute('data-mk-node', nodeKey);
      this.visit(element, identity, identities, ids);
    }
  }

  commit(identities) {
    // Only mounted identities survive; removed records receive fresh node IDs.
    this.current = identities;
  }
}
