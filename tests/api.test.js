import { describe, it, expect, vi } from 'vitest';
import { API } from '../lib/index.js';

class ItemsApi extends API.Resource {
  static path = '/items';
}

class TasksApi extends API.Resource {
  static path = '/projects/:project_id/tasks';
}

const response = (data, status = 200) => ({ ok: status < 400, status, text: async () => data === undefined ? '' : JSON.stringify(data) });
const setup = (data = { item: { id: 12 } }) => { const fetch = vi.fn().mockResolvedValue(response(data)); return { api: new ItemsApi({ fetch }), fetch }; };
describe('Resource transport', () => {
  it('binds the browser transport to globalThis rather than the resource instance', async () => {
    const fetch = vi.fn(function () {
      expect(this).toBe(globalThis);
      return Promise.resolve(response([]));
    });
    await new ItemsApi({ fetch }).index();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('encodes route params and preserves response envelopes', async () => {
    const { api, fetch } = setup(); expect(await api.show({ id: 'a/b ?' })).toEqual({ item: { id: 12 } }); expect(fetch.mock.calls[0][0]).toBe('http://localhost:9292/items/a%2Fb%20%3F');
  });
  it('encodes query values and omits absent values', async () => {
    const { api, fetch } = setup([]); await api.index({ query: { details: 1, limit: 24, offset: 0, search: 'a & b', ignored: undefined } });
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:9292/items?details=1&limit=24&offset=0&search=a+%26+b');
  });
  it.each([['create', 'POST', '/items'], ['update', 'PATCH', '/items/12'], ['delete', 'DELETE', '/items/12']])('%s sends the correct verb and path', async (action, method, path) => {
    const { api, fetch } = setup(); await api[action]({ id: 12, data: { title: 'Hello' } }); const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(`http://localhost:9292${path}`); expect(options.method).toBe(method); if (action !== 'delete') expect(JSON.parse(options.body)).toEqual({ title: 'Hello' });
  });
  it('supports compatibility verbs and deletion suffixes', async () => {
    const { api, fetch } = setup(); await api.update({ id: 12, data: {}, method: 'PUT' }); await api.update({ id: 12, data: {}, method: 'POST' }); await api.delete({ id: 12, method: 'POST' });
    expect(fetch.mock.calls.map(([url, init]) => [url, init.method])).toEqual([['http://localhost:9292/items/12', 'PUT'], ['http://localhost:9292/items/12', 'POST'], ['http://localhost:9292/items/12/delete', 'POST']]);
  });
  it('supports nested resources and requires parent route parameters', async () => {
    const fetch = vi.fn().mockResolvedValue(response({}));
    const api = new TasksApi({ fetch, baseURL: '/api' });
    await api.index({ project_id: 4 });
    await api.create({ project_id: 4, data: { title: 'Task' } });
    await api.show({ project_id: 4, id: 2 });
    await api.update({ project_id: 4, id: 2, data: {} });
    await api.delete({ project_id: 4, id: 2 });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/projects/4/tasks', '/api/projects/4/tasks',
      '/api/projects/4/tasks/2', '/api/projects/4/tasks/2', '/api/projects/4/tasks/2',
    ]);
    expect(() => api.index()).toThrow('project_id');
  });
  it('lets subclasses define paths and validates params before fetch', async () => {
    const fetch = vi.fn().mockResolvedValue(response([])); const api = new TasksApi({ fetch, baseURL: '/api/' }); expect(() => api.show({ id: 1 })).toThrow('project_id'); expect(fetch).not.toHaveBeenCalled();
    await api.show({ project_id: 3, id: 0 }); expect(fetch.mock.calls[0][0]).toBe('/api/projects/3/tasks/0');
  });
  it('preserves validation details and handles empty and non-JSON responses', async () => {
    const { api, fetch } = setup(); fetch.mockResolvedValueOnce(response({ error: 'Validation failed', details: { title: ['required'] } }, 422));
    await expect(api.create({ data: {} })).rejects.toMatchObject({ status: 422, data: { details: { title: ['required'] } } });
    fetch.mockResolvedValueOnce(response(undefined, 204)); expect(await api.delete({ id: 1 })).toBeNull();
    fetch.mockResolvedValueOnce({ status: 502, ok: false, text: async () => 'Bad gateway' }); await expect(api.index()).rejects.toMatchObject({ status: 502 });
  });
  it('wraps network errors but preserves cancellation and signals', async () => {
    const { api, fetch } = setup(); fetch.mockRejectedValueOnce(new TypeError('Failed')); await expect(api.index()).rejects.toBeInstanceOf(API.ApiError);
    const controller = new AbortController(); controller.abort(); const error = new DOMException('Aborted', 'AbortError'); fetch.mockRejectedValueOnce(error);
    await expect(api.index({ signal: controller.signal })).rejects.toBe(error); expect(fetch.mock.calls.at(-1)[1].signal).toBe(controller.signal);
  });
  it('supports form encoding and headers', async () => {
    const fetch = vi.fn().mockResolvedValue(response({})); const api = new ItemsApi({ fetch, encoding: 'form', headers: { 'X-Example': 'yes' } }); await api.create({ data: { title: 'A & B' } });
    expect(fetch.mock.calls[0][1]).toMatchObject({ body: 'title=A+%26+B', headers: { 'X-Example': 'yes', 'Content-Type': 'application/x-www-form-urlencoded' } });
  });
});
