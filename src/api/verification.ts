import { getApiBaseUrl } from "./resources";
import { extractApiErrorMessage } from "../utils/errorLogger";
import type { VerificationStatus } from "../types";

export interface VerificationDetails {
  id?: string;
  status: VerificationStatus | string;
  reason?: string;
  notes?: string;
  verifiedAt?: string;
  timestamp?: string;
  createdAt?: string;
  details?: string;
}

export async function fetchVerification(id: string): Promise<VerificationDetails> {
  const url = `${getApiBaseUrl()}/resources/${encodeURIComponent(id)}/verification`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(await extractApiErrorMessage(res, "Failed to load verification details"));
  }

  return res.json();
}
