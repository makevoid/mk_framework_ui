import { createHash } from 'node:crypto';

// Source locations keep conditional siblings stable; loop values contribute keys.
export class TemplateIdentityPlugin {
  postParse(ast) {
    this.serial = 0;
    this.walk(ast);
    return ast;
  }

  walk(node, loops = []) {
    if (!node || typeof node !== 'object') return;
    const context = node.type === 'Each' ? [...loops, node.val] : loops;
    if (node.type === 'Tag') this.markTag(node, context);

    for (const [key, value] of Object.entries(node)) {
      if (key === 'attrs' || key === 'filename') continue;
      if (Array.isArray(value)) {
        for (const child of value) this.walk(child, context);
      } else if (value && typeof value === 'object') {
        this.walk(value, context);
      }
    }
  }

  markTag(node, loops) {
    const file = createHash('sha256').update(node.filename || 'template').digest('hex').slice(0, 12);
    this.addAttribute(node, 'data-mk-site', JSON.stringify(`${file}-${this.serial++}`));
    if (!loops.length || node.attrs.some(attribute => attribute.name === 'data-key')) return;

    const values = loops.map(value => (
      `(typeof ${value} === 'object' && ${value} !== null ? ${value}.id : ${value})`
    ));
    this.addAttribute(node, 'data-key', `JSON.stringify([${values.join(',')}])`);
  }

  addAttribute(node, name, val) {
    node.attrs.push({ name, val, mustEscape: true });
  }
}
