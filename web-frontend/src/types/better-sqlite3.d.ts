declare module "better-sqlite3" {
  interface DatabaseOptions {
    readonly?: boolean;
    fileMustExist?: boolean;
  }

  interface Statement<Row = any> {
    all(...params: unknown[]): Row[];
    get(...params: unknown[]): Row | undefined;
    run(...params: unknown[]): { changes: number; lastInsertRowid: number };
  }

  class Database<Row = any> {
    constructor(filename: string, options?: DatabaseOptions);
    pragma(statement: string): void;
    exec(sql: string): void;
    prepare<T = Row>(sql: string): Statement<T>;
    close(): void;
  }

  namespace Database {
    export type Database<Row = any> = InstanceType<typeof Database<Row>>;
  }

  export = Database;
}
