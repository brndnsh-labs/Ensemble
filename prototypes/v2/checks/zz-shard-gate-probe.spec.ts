import { expect, test } from './fixtures';

// TEMPORARY — proves the sharded v2-checks aggregate reports RED when a shard
// fails. Removed in the next commit on this branch.
test('shard gate probe: this must fail', () => {
    expect(1).toBe(2);
});
