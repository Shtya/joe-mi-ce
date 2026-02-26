import { AsyncLocalStorage } from 'async_hooks';

export interface RequestStore {
  timezoneOffsetMinutes?: number;
}

export class RequestContext {
  private static readonly storage = new AsyncLocalStorage<RequestStore>();

  static run<T>(store: RequestStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  static getStore(): RequestStore | undefined {
    return this.storage.getStore();
  }

  static getTimezoneOffset(): number | undefined {
    return this.storage.getStore()?.timezoneOffsetMinutes;
  }
}
