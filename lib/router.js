class Route {
  constructor(pattern, handler) {
    this.handler = handler;
    this.names = [];
    const parts = pattern.split('/').map(part => this.compileSegment(part));
    this.regex = new RegExp(`^${parts.join('/')}/?$`);
  }

  compileSegment(segment) {
    if (segment.startsWith(':')) {
      this.names.push(segment.slice(1));
      return '([^/]+)';
    }
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  match(path) {
    const match = path.match(this.regex);
    if (!match) return null;
    return Object.fromEntries(this.names.map((name, index) => [
      name, decodeURIComponent(match[index + 1]),
    ]));
  }
}

export class Router {
  constructor({ window: target = window, notFound = () => {} } = {}) {
    this.window = target;
    this.routes = [];
    this.notFound = notFound;
    this.dispatch = this.dispatch.bind(this);
  }

  route(pattern, handler) {
    this.routes.push(new Route(pattern, handler));
    return this;
  }

  location() {
    const hash = this.window.location.hash.slice(1) || '/';
    const separator = hash.indexOf('?');
    return {
      path: separator < 0 ? hash : hash.slice(0, separator),
      query: new URLSearchParams(separator < 0 ? '' : hash.slice(separator + 1)),
    };
  }

  async dispatch() {
    this.abort?.abort();
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const { path, query } = this.location();
    for (const route of this.routes) {
      let params;
      try {
        params = route.match(path);
      } catch {
        // A matching route with malformed URI parameters uses the fallback.
        return this.notFound({ path, query, signal });
      }
      if (!params) continue;
      try {
        return await route.handler({ params, query, signal });
      } catch (error) {
        if (!signal.aborted) throw error;
      }
      return;
    }
    return this.notFound({ path, query, signal });
  }

  navigate(path) {
    if (this.window.location.hash === `#${path}`) return this.dispatch();
    this.window.location.hash = path;
  }

  async handleNavigation() {
    try {
      await this.dispatch();
    } catch (error) {
      if (this.onError) this.onError(error);
      else console.error(error);
    }
  }

  start() {
    if (this.started) return this;
    this.started = true;
    this.listener = () => this.handleNavigation();
    this.window.addEventListener('hashchange', this.listener);
    this.listener();
    return this;
  }

  stop() {
    this.window.removeEventListener('hashchange', this.listener);
    this.abort?.abort();
    this.started = false;
  }
}
