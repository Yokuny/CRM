import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type { ListProductsQuery } from '../services/product.service.js';
import * as productService from '../services/product.service.js';
import { ProductNotFoundError, ProductValidationError } from '../services/product.service.js';

// O Tenant vem sempre de req.tenantUser (AD-010), nunca do corpo/query —
// mesma convenção de customer.controller.ts. Traduz os erros tipados do
// service (T6) pro código HTTP certo (design.md Error Handling Strategy):
// ProductValidationError->400, ProductNotFoundError->404.
export const createProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await productService.createProduct(req.tenantUser.tenant as string, req.body);
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    if (e instanceof ProductValidationError) {
      next(new CustomError(e.message, 400));
      return;
    }
    next(e);
  }
};

export const listProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await productService.listProducts(
      req.tenantUser.tenant as string,
      req.query as unknown as ListProductsQuery,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const updateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await productService.updateProduct(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.body,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    if (e instanceof ProductValidationError) {
      next(new CustomError(e.message, 400));
      return;
    }
    if (e instanceof ProductNotFoundError) {
      next(new CustomError(e.message, 404));
      return;
    }
    next(e);
  }
};
