import { describe, expect, it } from 'vitest';
import { dbReqResTime, withDbTiming } from './db.metric.js';

describe('withDbTiming', () => {
  it('records success:true for an operation that resolves', async () => {
    const result = await withDbTiming('test.success', async () => 'ok');

    expect(result).toBe('ok');
    const metric = await dbReqResTime.get();
    const sample = metric.values.find(
      (value) => value.labels.operation === 'test.success' && value.labels.success === 'true',
    );
    expect(sample).toBeDefined();
  });

  it('records success:false and re-throws for an operation that rejects', async () => {
    await expect(
      withDbTiming('test.failure', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const metric = await dbReqResTime.get();
    const sample = metric.values.find(
      (value) => value.labels.operation === 'test.failure' && value.labels.success === 'false',
    );
    expect(sample).toBeDefined();
  });
});
