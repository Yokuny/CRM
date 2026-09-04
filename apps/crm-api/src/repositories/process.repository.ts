import type { ProcessDocument } from '@crm/db';
import { Process, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type ProcessRecord = {
  id: string;
  customer: string;
  template: string;
  templateVersion: number;
  stage: string;
  values: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

const toRecord = (doc: ProcessDocument): ProcessRecord => ({
  id: doc._id.toString(),
  customer: doc.customer.toString(),
  template: doc.template.toString(),
  templateVersion: doc.templateVersion,
  stage: doc.stage,
  values: doc.values,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export type CreateProcessInput = {
  tenant: string;
  customer: string;
  template: string;
  templateVersion: number;
  stage: string;
  values: Record<string, unknown>;
};

export const createProcess = async (data: CreateProcessInput): Promise<ProcessRecord> =>
  withDbTiming('process.createProcess', async () => {
    const doc = await Process.create({
      Tenant: data.tenant,
      customer: data.customer,
      template: data.template,
      templateVersion: data.templateVersion,
      stage: data.stage,
      values: data.values,
    });
    return toRecord(doc);
  });

// Toda rota por :id passa por aqui: o filtro carrega o Tenant, então o id de
// outro tenant simplesmente não existe (AD-010) — mesmo padrão de
// customer.repository.findById.
export const findById = async (tenantId: string, id: string): Promise<ProcessRecord | null> =>
  withDbTiming('process.findById', async () => {
    const doc = await Process.findOne(tenantScoped({ Tenant: tenantId, _id: id })).lean();
    return doc ? toRecord(doc) : null;
  });

// Histórico de Process de um Customer (P2/CORE-11). Um customerId de outro
// tenant (ou inexistente) simplesmente não casa nada — lista vazia, não erro
// (spec Edge Cases).
export const findByCustomer = async (tenantId: string, customerId: string): Promise<ProcessRecord[]> =>
  withDbTiming('process.findByCustomer', async () => {
    const docs = await Process.find(tenantScoped({ Tenant: tenantId, customer: customerId })).lean();
    return docs.map(toRecord);
  });

// findOneAndUpdate único: a atomicidade do próprio Mongo NA escrita é a
// guarda de concorrência de CORE-15 — não há janela de leitura-depois-escrita
// aqui (quem decide SE o novo valor é válido já rodou antes, no service).
export const updateValues = async (
  tenantId: string,
  id: string,
  values: Record<string, unknown>,
): Promise<ProcessRecord | null> =>
  withDbTiming('process.updateValues', async () => {
    const doc = await Process.findOneAndUpdate(
      tenantScoped({ Tenant: tenantId, _id: id }),
      { $set: { values } },
      { new: true },
    ).lean();
    return doc ? toRecord(doc) : null;
  });

export const updateStage = async (tenantId: string, id: string, stage: string): Promise<ProcessRecord | null> =>
  withDbTiming('process.updateStage', async () => {
    const doc = await Process.findOneAndUpdate(
      tenantScoped({ Tenant: tenantId, _id: id }),
      { $set: { stage } },
      { new: true },
    ).lean();
    return doc ? toRecord(doc) : null;
  });
