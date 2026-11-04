import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const customRequire = createRequire(import.meta.url);
const ts = customRequire('typescript');
const root = fileURLToPath(new URL('../', import.meta.url));
const NOW = Date.parse('2030-01-15T03:00:00Z'); // 10:00 in Jakarta

function clock(initial = NOW) {
  let value = initial;
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [value])); }
    static now() { return value; }
  }
  return { Date: TestDate, set: (next) => { value = next; }, now: () => value };
}

// No Node require, process, fetch, timers, or real application clients enter the VM.
// Only explicitly mocked externals and local src modules can be imported.
function loader(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    assert.ok(filename.startsWith(path.join(root, 'src') + path.sep));
    if (cache.has(filename)) return cache.get(filename).exports;
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    const errors = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: (f) => f, getCurrentDirectory: () => root, getNewLine: () => '\n',
    }));
    const moduleRecord = { exports: {} };
    cache.set(filename, moduleRecord);
    const sandboxRequire = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      let base;
      if (name.startsWith('@/')) base = path.join(root, 'src', name.slice(2));
      else if (name.startsWith('.')) base = path.resolve(path.dirname(filename), name);
      else throw new Error(`Unmocked external import: ${name}`);
      // Fail closed rather than accidentally loading a real Supabase client.
      assert.ok(!base.includes(path.join('lib', 'supabase')), `Mock required: ${name}`);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
      assert.ok(resolved, `Cannot resolve ${name}`);
      return load(path.relative(root, resolved));
    };
    const context = vm.createContext({
      module: moduleRecord, exports: moduleRecord.exports, require: sandboxRequire,
      console, AbortController, Date, Intl, ...globals,
    });
    new vm.Script(result.outputText, { filename }).runInContext(context, { timeout: 2000 });
    return moduleRecord.exports;
  }
  return load;
}

const jsx = (type, props, key) => ({ type, props: props || {}, key });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: Symbol('Fragment') };

function hooks() {
  const slots = [];
  const pending = [];
  let cursor = 0;
  let dirty = true;
  let component;
  let tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, (update) => {
        const next = typeof update === 'function' ? update(slots[i].value) : update;
        if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { current: initial };
      return slots[i];
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps, cleanup: previous?.cleanup };
        pending.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
    Suspense: Symbol('Suspense'),
  };
  function render() {
    cursor = 0;
    dirty = false;
    tree = component();
    for (const effect of pending.splice(0)) effect();
    return tree;
  }
  return {
    react,
    mount(fn) { component = fn; return render(); },
    get tree() { if (dirty) render(); return tree; },
    async flush() {
      // A full event-loop turn drains the in-memory Supabase promise chains.
      for (let i = 0; i < 20; i++) {
        if (dirty) render();
        await new Promise((resolve) => setImmediate(resolve));
        if (!dirty && !pending.length) return tree;
      }
      throw new Error('Mock render did not settle');
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

function nodes(tree, predicate) {
  const found = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) found.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  return found;
}
function one(tree, predicate) {
  const found = nodes(tree, predicate);
  assert.equal(found.length, 1, 'Expected exactly one matching rendered control');
  return found[0];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree === 'object') return text(tree.props?.children);
  return String(tree);
}
function change(view, id, value) {
  one(view.tree, (n) => n.props.id === id).props.onChange({ target: { value } });
}
async function submit(view) {
  let prevented = false;
  await one(view.tree, (n) => n.type === 'form').props.onSubmit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  await view.flush();
}

function supabase(tables, options = {}) {
  const queries = [];
  const rpcs = [];
  const user = { id: 'user-1', email: 'student@example.test', user_metadata: { full_name: 'Test Student' } };
  const client = {
    auth: {
      async getUser() { return options.session || { data: { user }, error: null }; },
      async signInWithPassword(credentials) {
        client.credentials.push(credentials);
        return { data: { user }, error: null };
      },
    },
    credentials: [],
    from(table) {
      assert.ok(Object.hasOwn(tables, table), `Unexpected table: ${table}`);
      const query = { table, steps: [] };
      queries.push(query);
      const chain = {};
      for (const method of ['select', 'eq', 'in', 'order', 'limit', 'single', 'maybeSingle']) {
        chain[method] = (...args) => { query.steps.push([method, ...args]); return chain; };
      }
      chain.then = (resolve, reject) => Promise.resolve().then(() => {
        const entry = tables[table];
        const data = typeof entry === 'function' ? entry(query) : entry;
        return data && Object.hasOwn(data, 'error') ? data : { data, error: null };
      }).then(resolve, reject);
      return chain;
    },
    async rpc(name, args) {
      rpcs.push({ name, args });
      return options.rpc ? options.rpc(name, args) : { data: null, error: null };
    },
  };
  return { client, queries, rpcs };
}

function component(relative, db, options = {}) {
  const view = hooks();
  const time = clock();
  const logs = [];
  const load = loader({
    react: view.react,
    'react/jsx-runtime': jsxRuntime,
    '@/lib/supabase/client': { createClient: () => db.client },
    '@/lib/hooks/use-current-time': { useCurrentTime: () => options.currentTime === null ? null : time.now() },
    ...options.mocks,
  }, {
    Date: time.Date,
    console: { ...console, error: (...args) => logs.push(args) },
    window: { confirm: () => true, prompt: () => 'Test rejection', ...options.window },
  });
  view.mount(load(relative).default);
  return { view, time, logs };
}

export { root, NOW, clock, loader, jsxRuntime, hooks, nodes, one, text, change, submit, supabase, component };
