import { ApiError, ApiResponse } from './response.js';

export class Resource {
  static baseURL = 'http://localhost:9292';
  static path = '';
  static encoding = 'json';

  constructor({
    baseURL = this.constructor.baseURL,
    fetch: transport = globalThis.fetch,
    headers = {},
    encoding = this.constructor.encoding,
  } = {}) {
    this.baseURL = baseURL.replace(/\/$/, '');
    // Native browser fetch requires the Window receiver, not a Resource instance.
    this.fetch = transport.bind(globalThis);
    this.headers = headers;
    this.encoding = encoding;
  }

  path(params = {}, member = false) {
    const pattern = `${this.constructor.path}${member ? '/:id' : ''}`;
    return pattern.replace(/:([a-z_]+)/gi, (_, key) => {
      const value = params[key];
      if (value === undefined || value === null || value === '') {
        throw new TypeError(`Missing route parameter: ${key}`);
      }
      return encodeURIComponent(value);
    });
  }

  requestURL(path, query = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null) search.set(key, String(value));
    }
    const suffix = search.size ? `?${search}` : '';
    return `${this.baseURL}${path}${suffix}`;
  }

  requestOptions(method, { data, signal, headers = {} }) {
    const options = {
      method,
      signal,
      headers: { Accept: 'application/json', ...this.headers, ...headers },
    };
    if (data !== undefined) {
      const form = this.encoding === 'form';
      options.headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
      options.body = form ? new URLSearchParams(data).toString() : JSON.stringify(data);
    }
    return options;
  }

  async request(method, path, options = {}) {
    const url = this.requestURL(path, options.query);
    const init = this.requestOptions(method, options);
    const response = await this.send(url, init);
    return new ApiResponse(response).read();
  }

  async send(url, options) {
    try {
      return await this.fetch(url, options);
    } catch (cause) {
      if (options.signal?.aborted || cause.name === 'AbortError') throw cause;
      throw new ApiError('Could not reach the API. Check the backend URL and connection.', { cause });
    }
  }

  index({ query, signal, ...params } = {}) {
    return this.request('GET', this.path(params), { query, signal });
  }

  show({ signal, query, ...params } = {}) {
    return this.request('GET', this.path(params, true), { signal, query });
  }

  create({ data, signal, ...params } = {}) {
    return this.request('POST', this.path(params), { data, signal });
  }

  update({ data, signal, method = 'PATCH', ...params } = {}) {
    if (!['PATCH', 'PUT', 'POST'].includes(method)) {
      throw new TypeError('Update method must be PATCH, PUT or POST');
    }
    return this.request(method, this.path(params, true), { data, signal });
  }

  delete({ signal, method = 'DELETE', ...params } = {}) {
    if (!['DELETE', 'POST'].includes(method)) {
      throw new TypeError('Delete method must be DELETE or POST');
    }
    const suffix = method === 'POST' ? '/delete' : '';
    return this.request(method, `${this.path(params, true)}${suffix}`, { signal });
  }
}
