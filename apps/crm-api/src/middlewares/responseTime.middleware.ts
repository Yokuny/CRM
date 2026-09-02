import type { Request, Response } from 'express';
import { Histogram } from 'prom-client';
import responseTimeLib from 'response-time';

// Latência HTTP por rota (FND-17) — o instrumento base; sem dashboard nesta
// feature.
export const reqResTime = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status_code'],
});

// Extraída do wrapper `response-time` para ser testável sem depender do
// monkey-patch de res.end da lib.
export const recordResponseTime = (req: Request, res: Response, time: number): void => {
  const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
  reqResTime.observe({ method: req.method, route, status_code: res.statusCode }, time / 1000);
};

export const responseTime = responseTimeLib(recordResponseTime);
