import { compileClient } from './index.js';

class TemplateDependencies {
  constructor() {
    this.dependents = new Map();
  }

  replace(owner, files) {
    for (const [file, owners] of this.dependents) {
      owners.delete(owner);
      if (!owners.size) this.dependents.delete(file);
    }
    for (const file of files) {
      if (!this.dependents.has(file)) this.dependents.set(file, new Set());
      this.dependents.get(file).add(owner);
    }
  }

  invalidate(file, moduleGraph) {
    for (const id of this.dependents.get(file) || []) {
      const module = moduleGraph.getModuleById(id);
      if (module) moduleGraph.invalidateModule(module);
    }
  }
}

export default function mkframePug() {
  const templates = new TemplateDependencies();
  return {
    name: 'mkframe-pug',
    transform(source, id) {
      if (!id.endsWith('.pug')) return;
      const { body, dependencies } = compileClient(source, { filename: id });
      templates.replace(id, dependencies);
      for (const file of dependencies) this.addWatchFile(file);
      return { code: `${body}\nexport default template;`, map: null };
    },
    handleHotUpdate({ file, server }) {
      if (!file.endsWith('.pug')) return;
      templates.invalidate(file, server.moduleGraph);
      server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}
