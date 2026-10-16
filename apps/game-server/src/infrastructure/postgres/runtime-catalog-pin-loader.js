import { RuntimeCatalogError } from '@rus/runtime-catalog';
import { loadActiveRuntimeCatalogPin as loadActivePin } from
  '@rus/runtime-catalog/active-pin';
import { serverError } from '../../errors.js';

export async function loadActiveRuntimeCatalogPin(queryClient, catalogScope) {
  try {
    return await loadActivePin(queryClient, catalogScope);
  } catch (error) {
    if (error instanceof RuntimeCatalogError) {
      throw serverError(error.code, error.message);
    }
    throw error;
  }
}
