// @ts-check
// Builds every service from one set of dependencies.
//   const services = createServices({ repo });
//   await services.createRequest(user, input, files);

import { createDeps } from './context.js';
import { createRequestServices } from './requests.js';
import { createApprovalServices } from './approvals.js';
import { createTransferServices } from './transfers.js';
import { createBankStatusServices } from './bankStatus.js';
import { createAdminServices } from './admin.js';
import { createFileServices } from './files.js';
import { createExportServices } from './exports.js';

/** @param {{repo: import('../data/repository.js').Repository, clock?: () => string, newId?: () => string}} options */
export function createServices(options) {
  const deps = createDeps(options);
  return {
    ...createRequestServices(deps),
    ...createApprovalServices(deps),
    ...createTransferServices(deps),
    ...createBankStatusServices(deps),
    ...createAdminServices(deps),
    ...createFileServices(deps),
    ...createExportServices(deps),
  };
}
