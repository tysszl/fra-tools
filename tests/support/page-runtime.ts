// Runs a calculator page's inline script in bun against a minimal DOM stub, through its
// full startup path (URL params → state → render). Compiled once per page; every call
// runs the script fresh with its own state.
import { readFileSync } from "node:fs";

// The pre-rebuild feed pages, frozen as the parity reference.
const LEGACY = new Set(["feed-calc.html", "feed-calc-admin.html", "cplus-calc.html"]);

function createClassList() {
  const classes = new Set<string>();
  return {
    add(...names: string[]) { names.forEach(name => classes.add(name)); },
    remove(...names: string[]) { names.forEach(name => classes.delete(name)); },
    contains(name: string) { return classes.has(name); },
    toggle(name: string, force?: boolean) {
      const enabled = force === undefined ? !classes.has(name) : force;
      if (enabled) classes.add(name); else classes.delete(name);
      return enabled;
    },
  };
}

function createElementStub(id = "") {
  const element: Record<string, any> = {
    id,
    value: "",
    className: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    style: {},
    dataset: {},
    classList: createClassList(),
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    hasAttribute() { return false; },
    appendChild() {},
    removeChild() {},
    focus() {},
    select() {},
    remove() {},
  };
  return element;
}

export type PageRun<T> = { api: T; element: (id: string) => Record<string, any> };

export function compilePage<T>(fileName: string, exportNames: string[]) {
  const html = readFileSync(new URL(LEGACY.has(fileName) ? `../fixtures/legacy/${fileName}` : `../../${fileName}`, import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error(`${fileName} has no inline script`);
  const exportsExpression = `({ ${exportNames
    .map(name => `${name}: typeof ${name} === "undefined" ? undefined : ${name}`)
    .join(", ")} })`;
  const factory = new Function(
    "window", "history", "document", "localStorage", "navigator",
    `${script}\nreturn ${exportsExpression};`,
  ) as (...args: unknown[]) => T;

  return function run(search = ""): PageRun<T> {
    const elements = new Map<string, Record<string, any>>();
    const body = createElementStub("body");
    const documentStub = {
      body,
      title: "",
      documentElement: createElementStub("html"),
      getElementById(id: string) {
        if (!elements.has(id)) elements.set(id, createElementStub(id));
        return elements.get(id);
      },
      querySelectorAll() { return []; },
      createElement(tag: string) { return createElementStub(tag); },
      execCommand() { return true; },
    };
    const windowStub = {
      location: { search, pathname: "/", href: `https://tools.frontrowag.com/${search}` },
      isSecureContext: false,
      print() {},
      addEventListener() {},
    };
    const historyStub = { replaceState() {} };
    const localStorageStub = { getItem() { return null; }, setItem() {}, removeItem() {} };
    const api = factory(windowStub, historyStub, documentStub, localStorageStub, {});
    return { api, element: (id: string) => documentStub.getElementById(id)! };
  };
}
