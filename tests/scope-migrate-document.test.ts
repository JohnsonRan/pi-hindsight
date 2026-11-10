import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../extensions/config/config.js";
import {
  buildScopeMigratePlan,
  migrateDocumentScopeTags,
} from "../extensions/operations/scope-migrate.js";
import type { HindsightLikeClient, ResolvedConfig } from "../extensions/types.js";

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "pi-hindsight-document-migrate-"));
  mkdirSync(join(cwd, ".git"));
  const config: ResolvedConfig = {
    ...DEFAULT_CONFIG,
    setupComplete: true,
    scope: { ...DEFAULT_CONFIG.scope, projectId: "migration-test" },
    banks: {
      ...DEFAULT_CONFIG.banks,
      project: { enabled: true, bankId: "coding", derive: "manual" },
    },
  };
  const scope = buildScopeMigratePlan({ cwd, config, projectBankId: "coding" });
  const document = {
    id: "doc-1",
    bank_id: "coding",
    tags: [scope.legacyRepoTag, "source:pi", "topic:api"],
    original_text: "private document body",
  };
  const getDocument = vi.fn(
    async (): Promise<unknown> => ({ ...document, tags: [...document.tags] }),
  );
  const updateDocument = vi.fn(
    async (
      _bank: string,
      _id: string,
      options: Parameters<NonNullable<HindsightLikeClient["updateDocument"]>>[2],
    ) => {
      // A tag arriving after the preview must survive the incremental patch.
      document.tags.push("concurrent:tag");
      document.tags = [
        ...new Set([
          ...document.tags.filter((tag) => !options.removeTags?.includes(tag)),
          ...(options.addTags ?? []),
        ]),
      ];
      return { success: true };
    },
  );
  const client: HindsightLikeClient = {
    retain: vi.fn(async () => undefined),
    recall: async () => [],
    reflect: async () => ({}),
    getDocument,
    updateDocument,
  };
  return {
    args: { cwd, config, projectBankId: "coding", client, bankId: "coding", documentId: "doc-1" },
    scope,
    document,
    getDocument,
    updateDocument,
  };
}

describe("explicit document scope migration", () => {
  it("previews by default without returning document content or writing tags", async () => {
    const f = fixture();
    const result = await migrateDocumentScopeTags(f.args);
    expect(result).toMatchObject({
      dryRun: true,
      applied: false,
      addTags: [f.scope.projectTag],
      removeTags: [],
    });
    expect(f.updateDocument).not.toHaveBeenCalled();
    expect(f.args.client.retain).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(f.document.original_text);
  });

  it.each([undefined, false])(
    "requires explicit confirmation before even reading for a write: %j",
    async (confirm) => {
      const f = fixture();
      await expect(
        migrateDocumentScopeTags({
          ...f.args,
          dryRun: false,
          ...(confirm !== undefined ? { confirm } : {}),
        }),
      ).rejects.toThrow("confirm: true");
      expect(f.getDocument).not.toHaveBeenCalled();
      expect(f.updateDocument).not.toHaveBeenCalled();
    },
  );

  it.each(["other-bank", "project", "global", ""])(
    "rejects non-exact bank selection: %j",
    async (bankId) => {
      const f = fixture();
      await expect(migrateDocumentScopeTags({ ...f.args, bankId })).rejects.toThrow(
        "exact current Coding Bank ID",
      );
      expect(f.getDocument).not.toHaveBeenCalled();
    },
  );

  it.each(["", "   "])("rejects missing document identity: %j", async (documentId) => {
    const f = fixture();
    await expect(migrateDocumentScopeTags({ ...f.args, documentId })).rejects.toThrow(
      "exact documentId",
    );
    expect(f.getDocument).not.toHaveBeenCalled();
  });

  it.each(["disabled", "project-disabled", "unconfigured"])(
    "requires enabled setup: %s",
    async (mode) => {
      const f = fixture();
      const config: ResolvedConfig = {
        ...f.args.config,
        enabled: mode !== "disabled",
        banks: {
          ...f.args.config.banks,
          project: {
            ...f.args.config.banks.project,
            enabled: mode !== "project-disabled",
          },
        },
      };
      if (mode === "unconfigured") delete config.banks.project.bankId;
      await expect(migrateDocumentScopeTags({ ...f.args, config })).rejects.toThrow(
        "configured, enabled Coding Bank",
      );
      expect(f.getDocument).not.toHaveBeenCalled();
    },
  );

  it.each(["foreign", "mixed-legacy", "mixed-project", "unknown-path", "untagged"])(
    "rejects foreign or unverifiable ownership: %s",
    async (mode) => {
      const f = fixture();
      const cases: Record<string, string[]> = {
        foreign: ["project:other"],
        "mixed-legacy": [f.scope.legacyRepoTag, "project:other"],
        "mixed-project": [f.scope.projectTag, "project:other"],
        "unknown-path": ["repo:other-path-hash"],
        untagged: [],
      };
      f.document.tags = cases[mode]!;
      await expect(
        migrateDocumentScopeTags({ ...f.args, dryRun: false, confirm: true }),
      ).rejects.toThrow(/another project|current project scope/);
      expect(f.updateDocument).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    {},
    { id: "other", bank_id: "coding", tags: [] },
    { id: "doc-1", bank_id: "other", tags: [] },
    { id: "doc-1", bank_id: "coding" },
    { id: "doc-1", bank_id: "coding", tags: [1] },
  ])("fails closed on missing/mismatched document metadata: %j", async (response) => {
    const f = fixture();
    f.getDocument.mockResolvedValue(response);
    await expect(
      migrateDocumentScopeTags({ ...f.args, dryRun: false, confirm: true }),
    ).rejects.toThrow(/identity|ownership/);
    expect(f.updateDocument).not.toHaveBeenCalled();
  });

  it("adds only the project tag by default, preserving legacy and concurrent tags", async () => {
    const f = fixture();
    const result = await migrateDocumentScopeTags({ ...f.args, dryRun: false, confirm: true });
    expect(result).toMatchObject({ applied: true, dryRun: false, removeTags: [] });
    expect(f.updateDocument).toHaveBeenCalledWith("coding", "doc-1", {
      addTags: [f.scope.projectTag],
    });
    expect(f.document.tags).toEqual(
      expect.arrayContaining([
        f.scope.projectTag,
        f.scope.legacyRepoTag,
        "source:pi",
        "topic:api",
        "concurrent:tag",
      ]),
    );
    expect(f.args.client.retain).not.toHaveBeenCalled();
  });

  it("atomically replaces only the owned legacy tag and is idempotent", async () => {
    const f = fixture();
    const args = { ...f.args, dryRun: false, confirm: true, removeLegacyTag: true };
    const first = await migrateDocumentScopeTags(args);
    expect(first.applied).toBe(true);
    expect(f.updateDocument).toHaveBeenCalledWith("coding", "doc-1", {
      addTags: [f.scope.projectTag],
      removeTags: [f.scope.legacyRepoTag],
    });
    expect(f.document.tags).toEqual(
      expect.arrayContaining([f.scope.projectTag, "source:pi", "topic:api", "concurrent:tag"]),
    );
    expect(f.document.tags).not.toContain(f.scope.legacyRepoTag);
    expect(f.document.original_text).toBe("private document body");
    expect(await migrateDocumentScopeTags(args)).toMatchObject({
      applied: false,
      addTags: [],
      removeTags: [],
    });
    expect(f.updateDocument).toHaveBeenCalledOnce();
  });

  it("removes the owned legacy tag without removing the last project scope", async () => {
    const f = fixture();
    f.document.tags.push(f.scope.projectTag);
    await migrateDocumentScopeTags({
      ...f.args,
      dryRun: false,
      confirm: true,
      removeLegacyTag: true,
    });
    expect(f.updateDocument).toHaveBeenCalledWith("coding", "doc-1", {
      removeTags: [f.scope.legacyRepoTag],
    });
    expect(f.document.tags).toContain(f.scope.projectTag);
  });

  it("does not write after cancellation during the document read", async () => {
    const f = fixture();
    const controller = new AbortController();
    f.getDocument.mockImplementation(async () => {
      controller.abort();
      return f.document;
    });
    await expect(
      migrateDocumentScopeTags({
        ...f.args,
        dryRun: false,
        confirm: true,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(f.updateDocument).not.toHaveBeenCalled();
  });

  it.each(["getDocument", "updateDocument"] as const)(
    "reports an unavailable client capability: %s",
    async (method) => {
      const f = fixture();
      delete f.args.client[method];
      await expect(migrateDocumentScopeTags(f.args)).rejects.toThrow("unavailable in this client");
      expect(f.getDocument).not.toHaveBeenCalled();
    },
  );

  it("does not claim success for an explicitly rejected patch", async () => {
    const f = fixture();
    f.updateDocument.mockResolvedValue({ success: false });
    await expect(
      migrateDocumentScopeTags({ ...f.args, dryRun: false, confirm: true }),
    ).rejects.toThrow("not applied");
  });
});
