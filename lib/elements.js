const normalize = name => name.replace(/[-_]/g, '').toLowerCase();

// Vite's lazy import glob supplies a build-visible allowlist of component files.
// Template values select from this registry; they never become arbitrary URLs.
export class ElementRegistry {
  constructor(modules) {
    this.loaders = new Map();
    this.loaded = new Map();
    for (const [path, loader] of Object.entries(modules)) {
      this.register(path, loader);
    }
  }

  register(path, loader) {
    const file = path.split('/').at(-1);
    if (!file.endsWith('.js')) throw new TypeError(`Component module must be a .js file: ${path}`);
    const key = normalize(file.slice(0, -3));
    if (this.loaders.has(key)) throw new Error(`Ambiguous component filename: ${path}`);
    if (typeof loader !== 'function') throw new TypeError(`Expected a lazy module loader: ${path}`);
    this.loaders.set(key, loader);
  }

  load(name) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
      return Promise.reject(new Error(`Invalid data-element name: ${name}`));
    }
    const key = normalize(name);
    const loader = this.loaders.get(key);
    if (!loader) {
      return Promise.reject(new Error(`Unknown data-element "${name}". Add its module to ./components/ and register the import glob.`));
    }
    if (!this.loaded.has(key)) {
      const pending = this.importModule(loader, name).catch(error => {
        // Failed imports can be retried; concurrent successful loads share a promise.
        this.loaded.delete(key);
        throw error;
      });
      this.loaded.set(key, pending);
    }
    return this.loaded.get(key);
  }

  async importModule(loader, name) {
    const module = await Promise.resolve().then(loader);
    if (typeof module.default !== 'function') {
      throw new TypeError(`Component "${name}" must default-export a Component subclass`);
    }
    return module.default;
  }
}

export const elements = modules => new ElementRegistry(modules);
