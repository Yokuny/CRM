import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsaasClient } from '../providers/asaasClient.js';
import type { ToolContext } from './toolContext.js';

// Mock completo de @crm/db (não MongoMemoryServer): issuePaymentLink.ts fala
// diretamente com os Models (mesmo precedente de createOrder.ts, sem camada
// de repository), e este arquivo precisa simular a corrida de chave duplicada
// (E11000) de forma determinística — algo impraticável de orquestrar contra
// um Mongo real. Mesmo idioma de order.service.unit.test.ts/
// asaasIntegration.service.unit.test.ts (vi.mock('@crm/db', ...) completo).
const orderFindOneMock = vi.fn();
const paymentFindOneMock = vi.fn();
const paymentCreateMock = vi.fn();
const integrationFindOneMock = vi.fn();
const customerFindOneMock = vi.fn();
const customerUpdateOneMock = vi.fn();

vi.mock('@crm/db', () => ({
  tenantScoped: (filter: unknown) => filter,
  Order: { findOne: (...args: unknown[]) => orderFindOneMock(...args) },
  Payment: {
    findOne: (...args: unknown[]) => paymentFindOneMock(...args),
    create: (...args: unknown[]) => paymentCreateMock(...args),
  },
  AsaasIntegration: { findOne: (...args: unknown[]) => integrationFindOneMock(...args) },
  Customer: {
    findOne: (...args: unknown[]) => customerFindOneMock(...args),
    updateOne: (...args: unknown[]) => customerUpdateOneMock(...args),
  },
}));

import { issuePaymentLink } from './issuePaymentLink.js';

const lean = <T>(value: T) => ({ lean: () => Promise.resolve(value) });

const ORDER_ID = 'order-1';
const CUSTOMER_ID = 'customer-1';

const baseCtx = (asaasClient?: AsaasClient): ToolContext => ({
  tenantId: 'tenant-1',
  channelId: 'channel-1',
  conversationId: 'conversation-1',
  asaasClient,
});

const fakeOrder = (overrides: Record<string, unknown> = {}) => ({
  _id: { toString: () => ORDER_ID },
  status: 'confirmed',
  totalPrice: 5000,
  customer: { toString: () => CUSTOMER_ID },
  ...overrides,
});

const fakeCustomer = (overrides: Record<string, unknown> = {}) => ({
  _id: CUSTOMER_ID,
  name: 'Maria',
  phone: '5511999999999',
  document: '12345678900',
  asaasCustomerId: undefined,
  ...overrides,
});

const fakeIntegration = () => ({
  _id: 'integration-1',
  apiKeyEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
  environment: 'sandbox' as const,
  status: 'active' as const,
});

const fakeAsaasClient = (): { [K in keyof AsaasClient]: ReturnType<typeof vi.fn> } => ({
  ensureCustomer: vi.fn(),
  createPixCharge: vi.fn(),
  getCharge: vi.fn(),
});

describe('issuePaymentLink (spec.md P1 "Cliente paga um pedido confirmado via PIX", AD-009 Anel B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns {error} when the order does not exist for this tenant/conversation (defense-in-depth, spec.md Edge Cases)', async () => {
    orderFindOneMock.mockReturnValue(lean(null));
    const client = fakeAsaasClient();

    const result = await issuePaymentLink({ orderId: 'missing' }, baseCtx(client as unknown as AsaasClient));

    expect(result).toEqual({ error: expect.any(String) });
    expect(client.createPixCharge).not.toHaveBeenCalled();
    expect(paymentCreateMock).not.toHaveBeenCalled();
  });

  it.each(['pending_approval', 'rejected', 'payment_expired'] as const)(
    'returns {error} for a non-confirmed order (status=%s), with zero Asaas calls and zero Payment created (PAY-02, spec.md AC2)',
    async (status) => {
      orderFindOneMock.mockReturnValue(lean(fakeOrder({ status })));
      const client = fakeAsaasClient();

      const result = await issuePaymentLink({ orderId: ORDER_ID }, baseCtx(client as unknown as AsaasClient));

      expect(result).toEqual({ error: expect.any(String) });
      expect(client.ensureCustomer).not.toHaveBeenCalled();
      expect(client.createPixCharge).not.toHaveBeenCalled();
      expect(paymentCreateMock).not.toHaveBeenCalled();
    },
  );

  it('creates a Payment and returns {status, billingType:"PIX", totalPrice, pixPayload, pixEncodedImage} on the happy path (PAY-01, spec.md AC1), creating the Asaas customer on first use', async () => {
    orderFindOneMock.mockReturnValue(lean(fakeOrder()));
    paymentFindOneMock.mockReturnValue(lean(null));
    integrationFindOneMock.mockReturnValue(lean(fakeIntegration()));
    customerFindOneMock.mockReturnValue(lean(fakeCustomer()));
    const client = fakeAsaasClient();
    client.ensureCustomer.mockResolvedValueOnce({ asaasCustomerId: 'cus_asaas_1' });
    client.createPixCharge.mockResolvedValueOnce({
      asaasChargeId: 'pay_asaas_1',
      pixPayload: '00020126...',
      pixEncodedImage: 'base64img',
      pixExpirationDate: new Date('2026-09-10'),
    });
    paymentCreateMock.mockImplementationOnce(async (doc: Record<string, unknown>) => ({ ...doc }));

    const result = await issuePaymentLink({ orderId: ORDER_ID }, baseCtx(client as unknown as AsaasClient));

    expect(result).toEqual({
      orderId: ORDER_ID,
      status: 'pending',
      billingType: 'PIX',
      totalPrice: 5000,
      pixPayload: '00020126...',
      pixEncodedImage: 'base64img',
    });
    expect(client.ensureCustomer).toHaveBeenCalledWith(expect.objectContaining({ environment: 'sandbox' }), {
      name: 'Maria',
      phone: '5511999999999',
      document: '12345678900',
    });
    expect(customerUpdateOneMock).toHaveBeenCalledWith(expect.anything(), {
      $set: { asaasCustomerId: 'cus_asaas_1' },
    });
    expect(client.createPixCharge).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'sandbox' }),
      expect.objectContaining({ asaasCustomerId: 'cus_asaas_1', value: 5000, description: `Pedido ${ORDER_ID}` }),
    );
    const [, chargeParams] = client.createPixCharge.mock.calls[0] as [unknown, { dueDate: string }];
    expect(chargeParams.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(paymentCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Tenant: 'tenant-1',
        order: expect.anything(),
        asaasChargeId: 'pay_asaas_1',
        asaasCustomerId: 'cus_asaas_1',
        billingType: 'PIX',
        value: 5000,
        status: 'pending',
        asaasStatus: 'PENDING',
      }),
    );
  });

  it('reuses an existing Customer.asaasCustomerId without calling ensureCustomer again (spec.md Edge Cases)', async () => {
    orderFindOneMock.mockReturnValue(lean(fakeOrder()));
    paymentFindOneMock.mockReturnValue(lean(null));
    integrationFindOneMock.mockReturnValue(lean(fakeIntegration()));
    customerFindOneMock.mockReturnValue(lean(fakeCustomer({ asaasCustomerId: 'cus_existing' })));
    const client = fakeAsaasClient();
    client.createPixCharge.mockResolvedValueOnce({ asaasChargeId: 'pay_2' });
    paymentCreateMock.mockImplementationOnce(async (doc: Record<string, unknown>) => ({ ...doc }));

    await issuePaymentLink({ orderId: ORDER_ID }, baseCtx(client as unknown as AsaasClient));

    expect(client.ensureCustomer).not.toHaveBeenCalled();
    expect(customerUpdateOneMock).not.toHaveBeenCalled();
    expect(client.createPixCharge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ asaasCustomerId: 'cus_existing' }),
    );
  });

  it('returns the EXISTING Payment state without invoking ctx.asaasClient at all, never re-checking the integration (PAY-03, spec.md AC3, idempotent)', async () => {
    orderFindOneMock.mockReturnValue(lean(fakeOrder()));
    paymentFindOneMock.mockReturnValue(
      lean({ status: 'paid', value: 5000, pixPayload: 'existing-payload', pixEncodedImage: 'existing-img' }),
    );
    const client = fakeAsaasClient();

    const result = await issuePaymentLink({ orderId: ORDER_ID }, baseCtx(client as unknown as AsaasClient));

    expect(result).toEqual({
      orderId: ORDER_ID,
      status: 'paid',
      billingType: 'PIX',
      totalPrice: 5000,
      pixPayload: 'existing-payload',
      pixEncodedImage: 'existing-img',
    });
    expect(client.ensureCustomer).not.toHaveBeenCalled();
    expect(client.createPixCharge).not.toHaveBeenCalled();
    expect(client.getCharge).not.toHaveBeenCalled();
    expect(integrationFindOneMock).not.toHaveBeenCalled();
    expect(paymentCreateMock).not.toHaveBeenCalled();
  });

  it('returns {error} when no active AsaasIntegration exists for the tenant, with zero Asaas calls (PAY-04, spec.md AC4)', async () => {
    orderFindOneMock.mockReturnValue(lean(fakeOrder()));
    paymentFindOneMock.mockReturnValue(lean(null));
    integrationFindOneMock.mockReturnValue(lean(null));
    const client = fakeAsaasClient();

    const result = await issuePaymentLink({ orderId: ORDER_ID }, baseCtx(client as unknown as AsaasClient));

    expect(result).toEqual({ error: expect.any(String) });
    expect(client.ensureCustomer).not.toHaveBeenCalled();
    expect(client.createPixCharge).not.toHaveBeenCalled();
    expect(paymentCreateMock).not.toHaveBeenCalled();
  });

  it('returns {error} when ctx.asaasClient is undefined even with an active integration (deployment gap, same PAY-04 class — never throws)', async () => {
    orderFindOneMock.mockReturnValue(lean(fakeOrder()));
    paymentFindOneMock.mockReturnValue(lean(null));
    integrationFindOneMock.mockReturnValue(lean(fakeIntegration()));

    const result = await issuePaymentLink({ orderId: ORDER_ID }, baseCtx(undefined));

    expect(result).toEqual({ error: expect.any(String) });
    expect(paymentCreateMock).not.toHaveBeenCalled();
  });

  it('returns {error} and persists no Payment when the Asaas charge-creation call fails (spec.md Edge Cases, no orphaned partial state)', async () => {
    orderFindOneMock.mockReturnValue(lean(fakeOrder()));
    paymentFindOneMock.mockReturnValue(lean(null));
    integrationFindOneMock.mockReturnValue(lean(fakeIntegration()));
    customerFindOneMock.mockReturnValue(lean(fakeCustomer({ asaasCustomerId: 'cus_existing' })));
    const client = fakeAsaasClient();
    client.createPixCharge.mockRejectedValueOnce(new Error('Asaas indisponível'));

    const result = await issuePaymentLink({ orderId: ORDER_ID }, baseCtx(client as unknown as AsaasClient));

    expect(result).toEqual({ error: expect.any(String) });
    expect(paymentCreateMock).not.toHaveBeenCalled();
  });

  it('on a Payment.create duplicate-key race (E11000, ingest.ts:79-80 shape), re-fetches and returns the concurrently-created Payment instead of throwing (spec.md Assumptions — idempotent issue_payment_link)', async () => {
    orderFindOneMock.mockReturnValue(lean(fakeOrder()));
    paymentFindOneMock
      .mockReturnValueOnce(lean(null))
      .mockReturnValueOnce(lean({ status: 'pending', value: 5000, pixPayload: 'raced-payload' }));
    integrationFindOneMock.mockReturnValue(lean(fakeIntegration()));
    customerFindOneMock.mockReturnValue(lean(fakeCustomer({ asaasCustomerId: 'cus_existing' })));
    const client = fakeAsaasClient();
    client.createPixCharge.mockResolvedValueOnce({ asaasChargeId: 'pay_race' });
    paymentCreateMock.mockRejectedValueOnce(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));

    const result = await issuePaymentLink({ orderId: ORDER_ID }, baseCtx(client as unknown as AsaasClient));

    expect(result).toEqual({
      orderId: ORDER_ID,
      status: 'pending',
      billingType: 'PIX',
      totalPrice: 5000,
      pixPayload: 'raced-payload',
      pixEncodedImage: undefined,
    });
    expect(paymentFindOneMock).toHaveBeenCalledTimes(2);
  });
});
