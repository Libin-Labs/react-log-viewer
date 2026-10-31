import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement: h, act, useState } = await import('react');
const { createRoot } = await import('react-dom/client');
const { LogViewer } = await import('../dist/esm/index.js');
const makeLines = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: String(i),
    message: `message ${i}`,
    level: i % 2 ? 'error' : 'info',
  }));

function mount(t, element) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  t.after(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, render: (node) => act(() => root.render(node)) };
}

test('fixed-height virtualization renders a small window and responds to real scroll events', (t) => {
  const { host } = mount(
    t,
    h(LogViewer, {
      lines: makeLines(1000),
      height: 120,
      rowHeight: 24,
      overscan: 2,
      follow: false,
    }),
  );
  assert.equal(host.querySelectorAll('[role="listitem"]').length, 7);
  const viewport = host.querySelector('[aria-label="Log lines"]');
  act(() => {
    viewport.scrollTop = 2400;
    viewport.dispatchEvent(new window.Event('scroll', { bubbles: true }));
  });
  assert.equal(host.querySelector('[role="listitem"]').getAttribute('aria-posinset'), '99');
  assert.ok(host.querySelectorAll('[role="listitem"]').length <= 9);
  assert.equal(host.querySelector('[role="listitem"]').getAttribute('aria-setsize'), '1000');
});

test('follow scrolls to the newest append, reports user scrolling away and respects pause', (t) => {
  const changes = [];
  const props = { height: 120, rowHeight: 24, onFollowChange: (value) => changes.push(value) };
  const { host, render } = mount(
    t,
    h(LogViewer, { ...props, lines: makeLines(100), follow: true }),
  );
  const viewport = host.querySelector('[aria-label="Log lines"]');
  assert.equal(viewport.scrollTop, 2280);
  act(() => {
    viewport.scrollTop = 0;
    viewport.dispatchEvent(new window.Event('scroll', { bubbles: true }));
  });
  assert.deepEqual(changes, [false]);
  render(h(LogViewer, { ...props, lines: makeLines(101), follow: false }));
  assert.equal(viewport.scrollTop, 0);
  render(h(LogViewer, { ...props, lines: makeLines(102), follow: true }));
  assert.equal(viewport.scrollTop, 2328);
});

test('controlled search, severity and follow controls deliver actual input interactions', (t) => {
  const lines = makeLines(10);
  function Demo() {
    const [query, setQuery] = useState('');
    const [levels, setLevels] = useState(['info', 'error']);
    const [follow, setFollow] = useState(true);
    return h(LogViewer, {
      lines,
      query,
      levels,
      follow,
      showControls: true,
      onQueryChange: setQuery,
      onLevelsChange: setLevels,
      onFollowChange: setFollow,
    });
  }
  const { host } = mount(t, h(Demo));
  const search = host.querySelector('input[type="search"]');
  act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
      search,
      'message 3',
    );
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.equal(host.querySelectorAll('[role="listitem"]').length, 1);
  const errorCheckbox = [...host.querySelectorAll('label')]
    .find((label) => label.textContent === 'error')
    .querySelector('input');
  act(() => errorCheckbox.click());
  assert.match(host.textContent, /No matching logs/);
  const followCheckbox = [...host.querySelectorAll('label')]
    .find((label) => label.textContent === 'Follow newest')
    .querySelector('input');
  act(() => followCheckbox.click());
  assert.equal(followCheckbox.checked, false);
});

test('tail cap is visible and source markup is escaped; line buttons dispatch original data', (t) => {
  const clicked = [];
  const lines = [
    { id: '1', message: 'old', level: 'info' },
    { id: '2', message: '<img src=x>', level: 'error', timestamp: '10:00' },
  ];
  const { host } = mount(
    t,
    h(LogViewer, { lines, maxLines: 1, onLineClick: (line) => clicked.push(line) }),
  );
  assert.equal(host.querySelector('img'), null);
  assert.match(host.querySelector('output').textContent, /1 older omitted/);
  act(() => host.querySelector('button').click());
  assert.equal(clicked[0], lines[1]);
  assert.equal(host.querySelector('time').textContent, '10:00 ');
});

test('custom fixed-height content and shrinking data keep a valid viewport', (t) => {
  const custom = (line, index) => h('em', null, `${line.id}:${index}`);
  const { host, render } = mount(
    t,
    h(LogViewer, {
      lines: makeLines(100),
      height: 100,
      rowHeight: 20,
      renderLine: custom,
    }),
  );
  assert.ok(host.querySelector('em'));
  render(
    h(LogViewer, {
      lines: makeLines(1),
      height: 100,
      rowHeight: 20,
      follow: false,
      renderLine: custom,
    }),
  );
  assert.equal(host.querySelector('[aria-label="Log lines"]').scrollTop, 0);
  assert.equal(host.querySelector('em').textContent, '0:0');
});
