import type { HttpClient } from "../http/client.js";

export abstract class BaseModule {
  protected readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }
}
