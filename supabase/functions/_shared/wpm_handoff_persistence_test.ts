import { assertEquals } from 'jsr:@std/assert';
import { openHandoff } from './wpm_handoff.ts';

function database(failTable?: string) {
  const writes: string[] = [];
  return {
    writes,
    from(table: string) {
      let writing = false;
      const query = {
        select() { return query; }, eq() { return query; }, limit() { return query; },
        update(_value: unknown) { writing = true; writes.push(table); return query; },
        insert(_value: unknown) { writing = true; writes.push(table); return query; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(resolve: (result: unknown) => unknown) {
          return Promise.resolve({ data: null, error: writing && table === failTable ? { message: 'database rejected write' } : null }).then(resolve);
        },
      };
      return query;
    },
  };
}
Deno.test('handoff does not report success when persistence fails', async () => {
  const db = database('wpm_handoff_events');
  const result = await openHandoff(db, { clientId: 'tenant-a', conversationId: 'thread-a', reason: 'Customer request' });
  assertEquals(result.opened, false);
});
Deno.test('handoff stops before event insertion when conversation update fails', async () => {
  const db = database('wpm_conversations');
  const result = await openHandoff(db, { clientId: 'tenant-a', conversationId: 'thread-a', reason: 'Customer request' });
  assertEquals(result.opened, false);
  assertEquals(db.writes, ['wpm_conversations']);
});
