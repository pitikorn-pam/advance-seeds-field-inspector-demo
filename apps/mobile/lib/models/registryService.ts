import { defaultDeploymentIndexUrl, loadCandidatesFromIndex } from "./modelRegistry";
import { currentModelPlatform } from "./modelStore";
import type { ModelCandidate, ModelPlatform } from "./types";

export type DeploymentChannel = "staging" | "production";
export type ModelLineSlug = "seeds-poc" | (string & {});

export const DEFAULT_MODEL_LINE: ModelLineSlug = "seeds-poc";

export interface DeploymentServiceConfig {
  modelLine?: ModelLineSlug;
  channel: DeploymentChannel;
  platform?: ModelPlatform;
  readyOnly?: boolean;
}

export interface ResolveDefaultModelRequest {
  modelLine?: ModelLineSlug;
  channel: DeploymentChannel;
  platform?: ModelPlatform;
  currentVersion?: string | null;
  currentCompat?: string | null;
}

export type ResolveDefaultModelResult =
  | { action: "noop"; reason?: string }
  | {
      action: "update";
      version_id: string;
      semver: string;
      platform: ModelPlatform;
      artifact_kind: "tflite" | "coreml";
      model_url: string;
      metadata: Record<string, unknown>;
      content_hash: string | null;
      size_bytes: number | null;
    }
  | {
      action: "artifact_missing";
      platform: ModelPlatform;
      version_id: string;
      semver: string;
      metadata: Record<string, unknown>;
    }
  | {
      action: "rebuild_required";
      reason: string;
      expected_compat: string;
      current_compat: string;
    };

export function listDeployedModelsUrl(config: DeploymentServiceConfig): string {
  const baseUrl = deploymentFunctionsBaseUrl();
  if (!baseUrl) return "";
  const params = new URLSearchParams({
    model_line: config.modelLine ?? DEFAULT_MODEL_LINE,
    channel: config.channel,
    platform: config.platform ?? currentModelPlatform(),
    ready_only: config.readyOnly ? "true" : "false",
  });
  return `${baseUrl}/list-deployed-models?${params.toString()}`;
}

export function resolveDefaultModelUrl(config: ResolveDefaultModelRequest): string {
  const baseUrl = deploymentFunctionsBaseUrl();
  if (!baseUrl) return "";
  const params = new URLSearchParams({
    model_line: config.modelLine ?? DEFAULT_MODEL_LINE,
    channel: config.channel,
    platform: config.platform ?? currentModelPlatform(),
    current_version: config.currentVersion ?? "",
    current_compat: config.currentCompat ?? "",
  });
  return `${baseUrl}/resolve-channel?${params.toString()}`;
}

export async function listDeployedModelCandidates(
  config: DeploymentServiceConfig,
): Promise<ModelCandidate[]> {
  const url = listDeployedModelsUrl(config);
  if (!url) throw new Error("Model registry service is not configured.");
  return loadCandidatesFromIndex(url);
}

export async function resolveDefaultModel(
  config: ResolveDefaultModelRequest,
): Promise<ResolveDefaultModelResult> {
  const url = resolveDefaultModelUrl(config);
  if (!url) throw new Error("Model registry service is not configured.");
  const response = await fetch(url, { headers: registryRequestHeaders(url) });
  if (!response.ok) throw new Error(`Resolve default model failed: ${response.status}`);
  return (await response.json()) as ResolveDefaultModelResult;
}

export function defaultDeploymentListUrl(channel: DeploymentChannel): string {
  return defaultDeploymentIndexUrl(channel);
}

export function registryRequestHeaders(url: string): Record<string, string> | undefined {
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!anonKey || !supabaseUrl || !url.startsWith(supabaseUrl)) return undefined;
  return { apikey: anonKey, authorization: `Bearer ${anonKey}` };
}

function deploymentFunctionsBaseUrl(): string {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1` : "";
}
