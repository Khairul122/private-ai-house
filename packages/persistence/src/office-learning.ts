import type { Queryable } from './database.js';

export class OfficeLearningRepository {
  constructor(private readonly sql: Queryable) {}
  async read(): Promise<unknown> {
    return (await this.sql.query<{ document: unknown }>("SELECT document FROM office_learning_state WHERE id='office'"))[0]?.document ?? null;
  }
  async save(document: unknown): Promise<void> {
    await this.sql.query("INSERT INTO office_learning_state(id,document) VALUES('office',$1::jsonb) ON CONFLICT(id) DO UPDATE SET document=excluded.document,updated_at=now()", [JSON.stringify(document)]);
  }
}
