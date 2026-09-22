import pug from 'pug';
import { TemplateIdentityPlugin } from './identity.js';

export function identityPlugin() {
  return new TemplateIdentityPlugin();
}

export function compile(source, options = {}) {
  return pug.compile(source, {
    ...options,
    plugins: [...(options.plugins || []), identityPlugin()],
  });
}

export function compileClient(source, options = {}) {
  return pug.compileClientWithDependenciesTracked(source, {
    ...options,
    name: 'template',
    compileDebug: false,
    inlineRuntimeFunctions: true,
    plugins: [...(options.plugins || []), identityPlugin()],
  });
}
