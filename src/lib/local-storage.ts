import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export class LocalStatement {
  constructor(private db: DatabaseSync, private sql: string, private values: SQLInputValue[] = []) {}
  bind(...values: SQLInputValue[]) { return new LocalStatement(this.db, this.sql, values); }
  execute() {
    const statement = this.db.prepare(this.sql);
    if (statement.columns().length) return { results: statement.all(...this.values), meta: { changes: 0 } };
    const result = statement.run(...this.values);
    return { results: [], meta: { changes: Number(result.changes) } };
  }
  async run() { return this.execute(); }
  async all<T = Record<string, unknown>>() { return this.execute() as unknown as {results:T[];meta:{changes:number}}; }
  async first<T = Record<string, unknown>>() { return (this.execute().results[0] as T) ?? null; }
}
export class LocalDatabase {
  private db: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, {recursive:true, mode:0o700});
    this.db = new DatabaseSync(path.join(directory, 'wallet-echo.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS state_records(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS state_revision(id INTEGER PRIMARY KEY,version INTEGER NOT NULL,token TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS abuse_rates(key TEXT PRIMARY KEY,timestamps TEXT NOT NULL,version INTEGER NOT NULL,expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS abuse_rates_expiry ON abuse_rates(expires_at);
      CREATE TABLE IF NOT EXISTS abuse_rejections(day TEXT NOT NULL,reason TEXT NOT NULL,count INTEGER NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(day,reason));
      CREATE INDEX IF NOT EXISTS abuse_rejections_expiry ON abuse_rejections(expires_at);`);
  }
  prepare(sql: string) { return new LocalStatement(this.db, sql); }
  async batch(statements: LocalStatement[]) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const results=statements.map(s=>s.execute()); this.db.exec('COMMIT'); return results; }
    catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
export class MemoryBucket {
  private images = new Map<string,{bytes:Uint8Array;until:number;timer:ReturnType<typeof setTimeout>}>();
  private drop(key:string){const image=this.images.get(key);if(image)clearTimeout(image.timer);this.images.delete(key);}
  private prune() { for(const [key,image] of this.images) if(image.until<=Date.now())this.drop(key); }
  async put(key:string, bytes:Uint8Array, _options?:unknown) {
    this.prune();this.drop(key);
    const timer=setTimeout(()=>this.drop(key),600000).unref();
    this.images.set(key,{bytes:new Uint8Array(bytes),until:Date.now()+600000,timer});
  }
  async get(key:string) { this.prune(); const image=this.images.get(key); return image ? {body:new Uint8Array(image.bytes)} : null; }
  async delete(key:string) { this.drop(key); }
  async list() { this.prune(); return {objects:[...this.images.keys()].map(key=>({key}))}; }
}
