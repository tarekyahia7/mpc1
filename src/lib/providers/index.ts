/** سجل المحولات — جلب المحول المناسب حسب المزود */
import type { ProviderId } from "../models";
import { kieAdapter } from "./kie";
import { cometapiAdapter } from "./cometapi";
import type { ProviderAdapter } from "./types";

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  kie: kieAdapter,
  cometapi: cometapiAdapter,
};

export function getAdapter(provider: string): ProviderAdapter {
  const adapter = ADAPTERS[provider as ProviderId];
  if (!adapter) throw new Error(`لا يوجد محول للمزود: ${provider}`);
  return adapter;
}

export type { ProviderAdapter, ProviderKeyRef, CheckTaskResult } from "./types";
