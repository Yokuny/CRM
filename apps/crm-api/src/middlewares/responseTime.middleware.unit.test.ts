import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { recordResponseTime, reqResTime } from './responseTime.middleware.js';

describe('recordResponseTime', () => {
  it('records the observed duration in the histogram with method, route and status_code labels', async () => {
    const req = { method: 'GET', baseUrl: '', path: '/health', route: { path: '/health' } } as unknown as Request;
    const res = { statusCode: 200 } as Response;

    recordResponseTime(req, res, 250);

    const metric = await reqResTime.get();
    const sample = metric.values.find(
      (value) => value.labels.method === 'GET' && value.labels.route === '/health' && value.labels.status_code === 200,
    );

    expect(sample).toBeDefined();
  });
});
