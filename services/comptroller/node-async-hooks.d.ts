// Minimal ambient type for node:async_hooks AsyncLocalStorage.
// Available at runtime on Cloudflare Workers via the `nodejs_compat` flag.
// Declared locally to avoid pulling in all of @types/node.
declare module "node:async_hooks" {
  export class AsyncLocalStorage<T> {
    run<R>(store: T, callback: () => R): R;
    getStore(): T | undefined;
  }
}
