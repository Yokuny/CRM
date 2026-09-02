export type Role = 'admin' | 'gestor' | 'operador';

export type TenantUser = {
  tenant?: string;
  user: string;
  role: Role[];
  isPlatformAdmin: boolean;
};
