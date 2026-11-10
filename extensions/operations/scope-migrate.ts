import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  deriveProjectBankId,
  legacyRepoScopeTag,
  projectScopeTag,
  resolveProjectIdentity,
} from "../banks/banking.js";
import type { HindsightLikeClient, ResolvedConfig } from "../types.js";
import { isMemorySetupComplete } from "../config/setup-gate.js";
import { hostConfigDirName, projectStateDir } from "../config/paths.js";

export interface ScopeMigratePlan {
  dryRun: true;
  /** Never rewrites banks/tags from this plan alone. */
  rewrite: "none";
  bankId: string;
  pathDerivedBank: boolean;
  scopeMode: ResolvedConfig["scope"]["mode"];
  projectTag: string;
  legacyRepoTag: string;
  projectId: string;
  projectIdBasis: "pin" | "remote" | "basename";
  projectIdSource: string;
  dualTagWindow: true;
  /**
   * True while retain still stamps legacy repo:<slug>-<path-hash>.
   * That legacy tag always depends on absolute path; dual-tag project: is the stable recovery path.
   */
  legacyPathHashTag: true;
  /**
   * True when project id itself is weak (basename only). Remote/pin identities are stable;
   * do not conflate them with path-hash legacy tags.
   */
  identityBasisWeak: boolean;
  findings: string[];
  guidance: string[];
  /** Optional remote tag sample counts when listTags results were provided. */
  remoteTagCounts?: {
    projectTagHits: number;
    legacyRepoTagHits: number;
    otherRepoTags: string[];
    sampleSize: number;
  };
  createdAt: string;
}

export interface ScopeMigrateReceipt extends ScopeMigratePlan {
  receiptPath: string;
}

/**
 * Build a dry-run scope migration plan. Never mutates Hindsight banks or tags.
 * Dual-tag retain/recall already covers the live window; this plan documents risk and next steps.
 */
export function buildScopeMigratePlan(args: {
  cwd: string;
  config: ResolvedConfig;
  projectBankId?: string;
  bankTags?: string[];
  now?: Date;
}): ScopeMigratePlan {
  const identity = resolveProjectIdentity(args.cwd, args.config);
  const bankId = args.projectBankId ?? deriveProjectBankId(args.cwd, args.config);
  const pathDerivedBank = !args.config.banks.project.bankId;
  const projectTag = projectScopeTag(identity.projectId);
  const legacyRepoTag = legacyRepoScopeTag(identity.legacyRepoKey);
  const identityBasisWeak = identity.basis === "basename";

  const findings: string[] = [];
  const guidance: string[] = [];

  findings.push(
    `Active dual-tag window: retain writes ${projectTag} and ${legacyRepoTag}; recall any_strict matches either.`,
  );
  findings.push(`Project id basis=${identity.basis} source=${identity.source} → ${projectTag}.`);
  findings.push(
    `Legacy tag ${legacyRepoTag} is path-hash based (machine/path moves change the hash). Stable project: tag is the recovery path for new writes.`,
  );

  if (pathDerivedBank) {
    findings.push(
      `Coding bank is path-derived (${bankId}); domain-tagged mode requires banks.project.bankId for a shared coding bank.`,
    );
    guidance.push(
      "Set banks.project.bankId (and setupComplete) so repos share one coding bank; do not rely on path-hash bank ids.",
    );
  }

  if (identityBasisWeak) {
    findings.push(
      "Project id is basename-derived; remotes or pins are more stable across clones and renames.",
    );
    guidance.push(
      'Prefer scope.projectId pin or projectIdStrategy "remote" when a git origin exists.',
    );
  } else {
    findings.push(
      `Project id basis is ${identity.basis} (stable across absolute path moves when dual-tag project: is present).`,
    );
  }

  let remoteTagCounts: ScopeMigratePlan["remoteTagCounts"];
  if (args.bankTags?.length) {
    const otherRepoTags = [
      ...new Set(args.bankTags.filter((t) => t.startsWith("repo:") && t !== legacyRepoTag)),
    ].sort();
    const projectTagHits = args.bankTags.filter((t) => t === projectTag).length;
    const legacyRepoTagHits = args.bankTags.filter((t) => t === legacyRepoTag).length;
    remoteTagCounts = {
      projectTagHits,
      legacyRepoTagHits,
      otherRepoTags,
      sampleSize: args.bankTags.length,
    };
    findings.push(
      `Remote tag sample (${args.bankTags.length}): project hits=${projectTagHits}, legacy hits=${legacyRepoTagHits}, other repo:* tags=${otherRepoTags.length}.`,
    );
    if (legacyRepoTagHits > 0 && projectTagHits === 0) {
      findings.push(
        "Sample has legacy repo tags without the stable project tag — reimport or dual-tag new retains before dropping dual-tag.",
      );
    }
    if (otherRepoTags.length > 0) {
      findings.push(
        `Other path-hash repo tags present (likely other machines/paths): ${otherRepoTags.slice(0, 5).join(", ")}${otherRepoTags.length > 5 ? "…" : ""}.`,
      );
      guidance.push(
        "Other repo:* path-hashes are expected after path moves; dual-tag project: is the recovery path for new retains.",
      );
    }
  } else {
    guidance.push(
      "Optional: pass bank tag inventory (listTags) into dry-run for remote counts; this local plan never rewrites.",
    );
  }

  guidance.push(
    `No silent rewrite: this dry-run only writes a local receipt under ${hostConfigDirName()}/hindsight/.`,
  );
  guidance.push(
    "When dual-tag can end: every active project memory carries project:<id> (or you completed export/import rebuild).",
  );

  return {
    dryRun: true,
    rewrite: "none",
    bankId,
    pathDerivedBank,
    scopeMode: args.config.scope.mode,
    projectTag,
    legacyRepoTag,
    projectId: identity.projectId,
    projectIdBasis: identity.basis,
    projectIdSource: identity.source,
    dualTagWindow: true,
    legacyPathHashTag: true,
    identityBasisWeak,
    findings,
    guidance,
    ...(remoteTagCounts ? { remoteTagCounts } : {}),
    createdAt: (args.now ?? new Date()).toISOString(),
  };
}

export function resolveScopeMigrateReceiptPath(cwd: string): string {
  return join(projectStateDir(cwd), "scope-migrate-receipt.json");
}

export async function writeScopeMigrateReceipt(
  cwd: string,
  plan: ScopeMigratePlan,
): Promise<ScopeMigrateReceipt> {
  const receiptPath = resolveScopeMigrateReceiptPath(cwd);
  await mkdir(dirname(receiptPath), { recursive: true });
  const receipt: ScopeMigrateReceipt = { ...plan, receiptPath };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

export interface DocumentScopeMigrationOptions {
  bankId: string;
  documentId: string;
  dryRun?: boolean;
  confirm?: boolean;
  removeLegacyTag?: boolean;
  signal?: AbortSignal;
}

/** Explicit single-document repair; the default migration plan remains read-only. */
export async function migrateDocumentScopeTags(
  args: DocumentScopeMigrationOptions & {
    cwd: string;
    config: ResolvedConfig;
    projectBankId: string;
    client: HindsightLikeClient;
  },
) {
  if (
    !args.config.enabled ||
    !args.config.banks.project.enabled ||
    !isMemorySetupComplete(args.config, args.cwd)
  ) {
    throw new Error("Document tag migration requires a configured, enabled Coding Bank");
  }
  if (!args.bankId || args.bankId !== args.projectBankId) {
    throw new Error("Provide the exact current Coding Bank ID for document tag migration");
  }
  if (typeof args.documentId !== "string" || !args.documentId.trim())
    throw new Error("An exact documentId is required");
  const dryRun = args.dryRun !== false;
  if (!dryRun && args.confirm !== true)
    throw new Error("Document tag migration requires confirm: true with dryRun: false");
  if (!args.client.getDocument || !args.client.updateDocument)
    throw new Error(
      "Document tag migration is unavailable in this client; upgrade to Hindsight SDK 1.2.1",
    );
  args.signal?.throwIfAborted();
  const raw = await args.client.getDocument(
    args.bankId,
    args.documentId,
    args.signal ? { signal: args.signal } : undefined,
  );
  const document = raw as { id?: unknown; bank_id?: unknown; tags?: unknown } | null;
  if (!document || document.id !== args.documentId || document.bank_id !== args.bankId)
    throw new Error("Document not found or its exact identity could not be verified");
  if (
    !Array.isArray(document.tags) ||
    !document.tags.every((tag: unknown) => typeof tag === "string")
  )
    throw new Error("Document tags are unavailable; scope ownership cannot be verified");
  const tags = document.tags as string[];
  const identity = resolveProjectIdentity(args.cwd, args.config);
  const projectTag = projectScopeTag(identity.projectId);
  const legacyTag = legacyRepoScopeTag(identity.legacyRepoKey);
  if (tags.some((tag) => tag.startsWith("project:") && tag !== projectTag))
    throw new Error("Document has another project tag; manual review is required");
  if (!tags.includes(projectTag) && !tags.includes(legacyTag))
    throw new Error("Document does not belong to the current project scope");
  const addTags = tags.includes(projectTag) ? [] : [projectTag];
  const removeTags = args.removeLegacyTag === true && tags.includes(legacyTag) ? [legacyTag] : [];
  const plan = { bankId: args.bankId, documentId: args.documentId, dryRun, addTags, removeTags };
  if (dryRun || (!addTags.length && !removeTags.length)) return { ...plan, applied: false };
  args.signal?.throwIfAborted();
  const result = await args.client.updateDocument(args.bankId, args.documentId, {
    ...(addTags.length ? { addTags } : {}),
    ...(removeTags.length ? { removeTags } : {}),
    ...(args.signal ? { signal: args.signal } : {}),
  });
  if ((result as { success?: boolean } | null)?.success === false)
    throw new Error("Document tag migration was not applied");
  return { ...plan, applied: true };
}
