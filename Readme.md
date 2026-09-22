# MK Framework UI · MkFrame

#### A small JavaScript UI framework with DOM Diffing based off Pug templates.

Note: This is Beta software. It works™ but it is still under development.

A small JavaScript UI framework for apps written with Pug templates. Components
render HTML and apply keyed DOM diffs through morphdom, preserving existing nodes,
input values and focus. Includes lazy child components, hash routing and a JSON
resource API layer for [MK Framework](https://github.com/makevoid/mk_framework)
or other HTTP backends.

ES modules, shipped as source. Node.js 20.19+ for development and template
compilation; a modern browser for rendering. Status: alpha.

## Install

The npm package name is `mkframe`. Once published to npm:

```sh
npm install mkframe
npm install --save-dev vite
```

Before the npm release, install directly from GitHub:

```sh
npm install github:makevoid/mk_framework_ui
npm install --save-dev vite
```

The package exports `mkframe` (browser runtime), `mkframe/pug` (Node.js template
compiler) and `mkframe/vite` (Vite plugin). Pug is included as a dependency and
compiled out of browser templates. No framework build step is required.

## Create an app

Set `"type": "module"` in your app's `package.json`, then add these files.

`vite.config.js`:

```js
import { defineConfig } from 'vite';
import pug from 'mkframe/vite';

export default defineConfig({ plugins: [pug()] });
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Counter</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.js"></script>
  </body>
</html>
```

`counter.pug`:

```pug
main
  h1 Counter
  button(type='button' data-click='increment') Count: #{count}
```

`main.js`:

```js
import { Component } from 'mkframe';
import template from './counter.pug';

class Counter extends Component {
  actions = {
    increment() {
      this.setState(state => ({ count: state.count + 1 }));
    },
  };
}

new Counter({ template, state: { count: 0 } }).mount('#app');
```

Run `npx vite`. Use `npx vite build` to build your own app for deployment.

## Components

`Component` accepts `template`, `state`, `props`, `elements`, `tw`, `parent` and
`onError`. The template receives props and state as locals (state takes precedence),
plus `tw` and a `props(value)` helper for serializing child props.

- `mount(elementOrSelector)` renders and calls `onMount()`.
- `setState(objectOrFunction)` merges state and renders synchronously.
- `setProps(object)` replaces props, calls `onPropsChanged(previous)` and renders.
- `ready` resolves when the current render's lazy children are ready.
- `unmount()` disposes children, calls `onUnmount()`, removes listeners and clears
  the mount element.

Expose handlers in `actions`. Pug attributes `data-click`, `data-input`,
`data-change` and `data-submit` name those handlers. Each receives `(event, element)`
with the component as `this`; submit handlers prevent default form submission.
Synchronous and asynchronous action errors go to `onError` (default: `console.error`).

Register lazy child modules on the parent:

```js
import { Component, elements } from 'mkframe';
import template from './app.pug';

const app = new Component({
  template,
  state: { item: { id: 1, title: 'Hello' } },
  elements: elements(import.meta.glob('./components/*.js')),
}).mount('#app');
await app.ready;
```

```pug
section(data-element='ItemCard' data-key=item.id data-props=props({ item }))
```

`components/item-card.js` must default-export a `Component` subclass that supplies
its template. Each host gets its own instance; imports are cached. Matching hosts
retain child state across parent renders, and changed props call `setProps()`.
Children inherit the registry, theme and error handler.

Call `this.emit('item:save', detail)` in a child to invoke the nearest ancestor's
matching `events` handler. Events pass `(detail, child)` and return the handler's
result, including promises.

## DOM diffing

```pug
ul
  each item in items
    li
      strong= item.title
      input(placeholder='Draft survives reordering')
```

The Pug compiler adds source identities and infers loop keys from `item.id` (or
the value for primitive lists). Use unique, immutable IDs, or set an explicit
`data-key`, such as `li(data-key=item.slug)`. Repeated primitive values need explicit
keys. For mixins inside loops, place a keyed wrapper around each mixin call.

The renderer gives elements stable generated IDs while mounted and preserves
explicit IDs. Keep explicit IDs unique across the document. Duplicate sibling
keys or IDs in a render throw before updating the live DOM. Reordering records
moves their existing nodes. State changes evaluate the whole template; DOM
updates are incremental.

Inputs, textareas and selects preserve user edits by default. Add `data-controlled`
to apply the template's current value on each render. Change a form's `data-key`
to reset it. Use `data-mk-ignore` for a subtree managed by another library.

`Renderer` is also exported for direct `new Renderer(element).render(html)` use.
Only compile trusted Pug and render trusted HTML; Pug's escaped interpolation
(`=` and `#{...}`) is appropriate for user text.

## API resources

```js
import { API } from 'mkframe';

class Posts extends API.Resource {
  static path = '/posts';
}

const posts = new Posts({ baseURL: '/api' });
await posts.index({ query: { limit: 20, offset: 0 } });
await posts.show({ id: 1 });
await posts.create({ data: { title: 'Hello' } });
await posts.update({ id: 1, data: { title: 'Updated' } });
await posts.delete({ id: 1 });
```

| Method | HTTP request |
| --- | --- |
| `index()` | `GET /posts` |
| `show({ id })` | `GET /posts/:id` |
| `create({ data })` | `POST /posts` |
| `update({ id, data })` | `PATCH /posts/:id` |
| `delete({ id })` | `DELETE /posts/:id` |

For MK Framework backends using POST compatibility routes:

```js
await posts.update({ id: 1, data: { title: 'Updated' }, method: 'POST' });
await posts.delete({ id: 1, method: 'POST' }); // POST /posts/1/delete
```

Update also accepts `method: 'PUT'`. For nested resources, set a path such as
`'/posts/:post_id/comments'` and pass `post_id` to each operation. Route parameters
are required and URL-encoded. Custom endpoints use
`resource.request(method, path, { data, query, signal, headers })`.

Constructor options include `baseURL` (default `http://localhost:9292`), `headers`,
`fetch` and `encoding` (`'json'` by default, or `'form'`). Every resource operation
accepts an abort `signal`; `index` and `show` also accept `query`. Responses retain
the server's JSON shape; empty responses return `null`. `API.ApiError` provides
`status` and `data`, including validation details. Abort errors are preserved.
Configure an app proxy or backend CORS when the API runs on a different origin.

## Hash routing

```js
import { Router } from 'mkframe';

const router = new Router({
  notFound: () => app.setState({ error: 'Not found' }),
});
router.route('/posts/:id', async ({ params, query, signal }) => {
  const post = await posts.show({ id: params.id, signal });
  if (!signal.aborted) app.setState({ post });
});
router.onError = error => app.setState({ error: error.message });
router.start();
router.navigate('/posts/1'); // #/posts/1
// Call router.stop() when disposing the app.
```

Routes match in registration order. `query` is a `URLSearchParams` instance. Each
navigation aborts the previous signal; check it before applying async results.

## Styling

Use your own CSS. The optional `TW` helpers merge Tailwind utility classes and
define reusable variants. Built-ins include `button`, `input`, `label`, `card`
and `badge`; templates receive them through `tw`.

```js
import { TW } from 'mkframe';

TW.cx('px-2', 'px-4'); // 'px-4'
const theme = {
  ...TW,
  ...TW.define({ heading: 'text-2xl font-bold' }),
};
// Pass tw: theme when constructing a component.
```

These helpers return class strings; they do not install or generate Tailwind CSS.
If using Tailwind, configure it in your app and include `node_modules/mkframe/lib`
in its source scanning so the built-in classes are generated.

## Template compilation without Vite

```js
import { compile, compileClient } from 'mkframe/pug';

const render = compile('h1= title', { filename: 'heading.pug' });
render({ title: 'Hello' });
const { body, dependencies } = compileClient('h1= title', {
  filename: 'heading.pug',
});
```

Both compilers add DOM identity attributes. `compileClient` returns JavaScript
defining `template(locals)`, with the Pug runtime inlined, plus include dependencies.
The Vite plugin turns `.pug` imports into default exports and reloads templates
when includes change. The compiler entry points run in Node.js.

## Development and release

```sh
npm ci
npm test
npm pack --dry-run
```

One Vitest suite runs in Node.js with jsdom, covering DOM identity, component
lifecycle, lazy children, templates, routing, API transport and combined flows.
The npm tarball contains only `lib/`, package metadata, this README and the MIT
license. To release from an npm account authorized for `mkframe`, run
`npm publish`; the specs run automatically before publication.
