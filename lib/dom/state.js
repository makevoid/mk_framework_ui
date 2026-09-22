export class DomState {
  constructor(root) {
    this.root = root;
    this.active = root.ownerDocument.activeElement;
    this.selection = this.active && typeof this.active.selectionStart === 'number'
      ? [this.active.selectionStart, this.active.selectionEnd, this.active.selectionDirection]
      : null;
  }

  preserveField(from, to) {
    // Uncontrolled fields keep user edits. data-controlled opts into state values.
    if (to.hasAttribute('data-controlled')) return;
    switch (from.tagName) {
      case 'INPUT':
        // File inputs reject nonempty value assignments. Copy the FileList so
        // morphdom sees the same selection while still updating attributes.
        if (from.type === 'file' && to.type === 'file') {
          to.files = from.files;
          break;
        }
        to.value = from.value;
        to.checked = from.checked;
        break;
      case 'TEXTAREA':
        to.value = from.value;
        break;
      case 'SELECT': {
        const selected = new Set([...from.selectedOptions].map(option => option.value));
        for (const option of to.options) {
          const keep = selected.has(option.value);
          option.selected = keep;
          // morphdom's final SELECT pass reads attributes, including on options
          // whose markup otherwise did not change when new options arrived.
          option.toggleAttribute('selected', keep);
        }
        break;
      }
    }
  }

  restoreFocus() {
    if (!this.active || !this.root.contains(this.active)) return;
    if (this.root.ownerDocument.activeElement !== this.active) {
      this.active.focus({ preventScroll: true });
    }
    if (this.selection && !this.active.hasAttribute('data-controlled')) {
      this.active.setSelectionRange(...this.selection);
    }
  }
}
