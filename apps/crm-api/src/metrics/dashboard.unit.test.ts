import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type GrafanaPanel = { title: string; targets?: Array<{ expr: string }> };
type GrafanaDashboard = { panels: GrafanaPanel[] };

const dashboardPath = fileURLToPath(new URL('../../../../ops/grafana/crm-api-dashboard.json', import.meta.url));

// OPS-06/07: valida a FORMA do dashboard-as-code (JSON válido, >=3 painéis,
// só as duas séries já registradas) — nunca um import real de Grafana (sem
// infra nesta rodada, ver spec.md Assumptions).
describe('ops/grafana/crm-api-dashboard.json', () => {
  const raw = readFileSync(dashboardPath, 'utf-8');
  const dashboard = JSON.parse(raw) as GrafanaDashboard;

  it('OPS-06: parses as valid JSON with a top-level panels array of length >= 3', () => {
    expect(Array.isArray(dashboard.panels)).toBe(true);
    expect(dashboard.panels.length).toBeGreaterThanOrEqual(3);
  });

  it('OPS-06(a): includes an HTTP latency p50/p95-by-route panel over http_request_duration_seconds_bucket', () => {
    const panel = dashboard.panels.find(
      (p) => p.title.toLowerCase().includes('latency') && p.title.toLowerCase().includes('route'),
    );
    expect(panel).toBeDefined();

    const exprs = (panel?.targets ?? []).map((t) => t.expr).join(' ');
    expect(exprs).toContain('histogram_quantile(0.50');
    expect(exprs).toContain('histogram_quantile(0.95');
    expect(exprs).toContain('http_request_duration_seconds_bucket');
  });

  it('OPS-06(b): includes an HTTP error-rate-by-route panel filtering status_code=~"5.." over http_request_duration_seconds_count', () => {
    const panel = dashboard.panels.find((p) => p.title.toLowerCase().includes('error rate'));
    expect(panel).toBeDefined();

    const exprs = (panel?.targets ?? []).map((t) => t.expr).join(' ');
    expect(exprs).toContain('http_request_duration_seconds_count');
    expect(exprs).toMatch(/status_code=~"5\.\."/);
  });

  it('OPS-06(c): includes a DB-operation-latency-by-operation panel over db_operation_duration_seconds_bucket', () => {
    const panel = dashboard.panels.find(
      (p) => p.title.toLowerCase().includes('db operation') && p.title.toLowerCase().includes('operation'),
    );
    expect(panel).toBeDefined();

    const exprs = (panel?.targets ?? []).map((t) => t.expr).join(' ');
    expect(exprs).toContain('db_operation_duration_seconds_bucket');
    expect(exprs).toContain('by (le, operation)');
  });

  it('OPS-07: panels reference only the two already-registered metric series (no invented metric)', () => {
    const allExprs = dashboard.panels.flatMap((p) => (p.targets ?? []).map((t) => t.expr)).join(' ');
    const metricRefs = allExprs.match(/[a-zA-Z_][a-zA-Z0-9_]*_(?:bucket|count|sum)\b/g) ?? [];

    expect(metricRefs.length).toBeGreaterThan(0);
    for (const ref of metricRefs) {
      const isKnownMetric =
        ref.startsWith('http_request_duration_seconds_') || ref.startsWith('db_operation_duration_seconds_');
      expect(isKnownMetric).toBe(true);
    }
  });
});
