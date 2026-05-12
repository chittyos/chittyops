// Destination resolver — must run before any rotate/store/register/bind.
//
// "Verified destination" means the target store is on the canonical allowlist
// AND the resolver can produce the concrete address (vault id, account id,
// registry URI). Anything outside the allowlist or anything that resolves
// to undefined fails closed with POLICY_BLOCKED_DESTINATION_UNVERIFIED.

import { PolicyError } from "./errors.js";

export type CanonicalStore =
  | "1password"
  | "cloudflare-secrets-store"
  | "chittyregistry"
  | "chittyauth";

const ALLOWLIST: ReadonlySet<CanonicalStore> = new Set<CanonicalStore>([
  "1password",
  "cloudflare-secrets-store",
  "chittyregistry",
  "chittyauth",
]);

export interface DestinationRequest {
  store: string;
  // Address inside the store. For 1P: vault/item/field. For CF Secrets Store:
  // accountId/storeName/key. For ChittyRegistry: chittycanon URI.
  address: string;
}

export interface ResolvedDestination {
  store: CanonicalStore;
  address: string;
  verified: true;
}

function isCanonicalStore(s: string): s is CanonicalStore {
  return ALLOWLIST.has(s as CanonicalStore);
}

const ADDRESS_VALIDATORS: Record<CanonicalStore, (a: string) => boolean> = {
  "1password": (a) => /^[^/]+\/[^/]+(\/[^/]+)?$/.test(a),
  "cloudflare-secrets-store": (a) => /^[a-f0-9]{32}\/[^/]+\/[^/]+$/i.test(a),
  chittyregistry: (a) => a.startsWith("chittycanon://"),
  chittyauth: (a) => /^[a-z0-9-]+\.chitty\.cc$/i.test(a) || a.startsWith("chittycanon://"),
};

export function resolveDestination(req: DestinationRequest): ResolvedDestination {
  if (!isCanonicalStore(req.store)) {
    throw new PolicyError(
      "POLICY_BLOCKED_DESTINATION_UNVERIFIED",
      `destination store '${req.store}' is not on the canonical allowlist`,
      { store: req.store, allowlist: Array.from(ALLOWLIST) },
    );
  }
  const validator = ADDRESS_VALIDATORS[req.store];
  if (!validator(req.address)) {
    throw new PolicyError(
      "POLICY_BLOCKED_DESTINATION_UNVERIFIED",
      `destination address '${req.address}' is malformed for store '${req.store}'`,
      { store: req.store, address: req.address },
    );
  }
  return { store: req.store, address: req.address, verified: true };
}
