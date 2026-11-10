import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../extensions/config/config.js";
import { PI_HINDSIGHT_USER_AGENT } from "../extensions/version.js";

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  createBank: vi.fn(async () => ({ bank_id: "bank" })),
  retain: vi.fn(async () => ({ accepted: true })),
  retainBatch: vi.fn(async () => ({ accepted: true })),
  listMentalModels: vi.fn(async () => ({ mental_models: [] })),
  getMentalModel: vi.fn(async () => ({ id: "mm1" })),
  createMentalModel: vi.fn(async () => ({ id: "mm1" })),
  updateMentalModel: vi.fn(async () => ({ id: "mm1" })),
  refreshMentalModel: vi.fn(async () => ({ id: "mm1" })),
  deleteMentalModel: vi.fn(async () => undefined),
  getKnowledgeBaseTree: vi.fn(async () => ({ nodes: [] })),
  createKnowledgeFolder: vi.fn(async () => ({ id: "folder1" })),
  createKnowledgePage: vi.fn(async () => ({ id: "page1", operation_id: "op1" })),
  getKnowledgePage: vi.fn(async () => ({ id: "page1", markdown: "# Page" })),
  searchKnowledgeBase: vi.fn(async () => ({ results: [] })),
  updateKnowledgeNode: vi.fn(async () => ({ id: "page1" })),
  deleteKnowledgeNode: vi.fn(async () => undefined),
  exportKnowledgeBase: vi.fn(async () => ({ files: [] })),
  updateBankConfig: vi.fn(async () => ({ bank_id: "bank" })),
  getBankConfig: vi.fn(async () => ({ bank_id: "bank" })),
}));

vi.mock("@vectorize-io/hindsight-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vectorize-io/hindsight-client")>();
  return {
    ...actual,
    HindsightClient: vi.fn(function (options) {
      mocks.constructor(options);
      return {
        createBank: mocks.createBank,
        retain: mocks.retain,
        retainBatch: mocks.retainBatch,
        listMentalModels: mocks.listMentalModels,
        getMentalModel: mocks.getMentalModel,
        createMentalModel: mocks.createMentalModel,
        updateMentalModel: mocks.updateMentalModel,
        refreshMentalModel: mocks.refreshMentalModel,
        deleteMentalModel: mocks.deleteMentalModel,
        getKnowledgeBaseTree: mocks.getKnowledgeBaseTree,
        createKnowledgeFolder: mocks.createKnowledgeFolder,
        createKnowledgePage: mocks.createKnowledgePage,
        getKnowledgePage: mocks.getKnowledgePage,
        searchKnowledgeBase: mocks.searchKnowledgeBase,
        updateKnowledgeNode: mocks.updateKnowledgeNode,
        deleteKnowledgeNode: mocks.deleteKnowledgeNode,
        exportKnowledgeBase: mocks.exportKnowledgeBase,
        updateBankConfig: mocks.updateBankConfig,
        getBankConfig: mocks.getBankConfig,
      };
    }),
  };
});

describe("Hindsight client adapter", () => {
  beforeEach(() => {
    mocks.constructor.mockClear();
    mocks.createBank.mockClear();
    mocks.retain.mockClear();
    mocks.retainBatch.mockClear();
    mocks.listMentalModels.mockClear();
    mocks.getMentalModel.mockClear();
    mocks.createMentalModel.mockClear();
    mocks.updateMentalModel.mockClear();
    mocks.refreshMentalModel.mockClear();
    mocks.deleteMentalModel.mockClear();
    mocks.getKnowledgeBaseTree.mockClear();
    mocks.createKnowledgeFolder.mockClear();
    mocks.createKnowledgePage.mockClear();
    mocks.getKnowledgePage.mockClear();
    mocks.searchKnowledgeBase.mockClear();
    mocks.updateKnowledgeNode.mockClear();
    mocks.deleteKnowledgeNode.mockClear();
    mocks.exportKnowledgeBase.mockClear();
    mocks.updateBankConfig.mockClear();
    mocks.getBankConfig.mockClear();
  });

  it("uses official retain for single memories when document tags are absent", async () => {
    const { createHindsightClient } = await import("../extensions/client/client.js");
    const client = createHindsightClient(DEFAULT_CONFIG);

    expect(mocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({ userAgent: PI_HINDSIGHT_USER_AGENT }),
    );

    await client.retain("bank", "content", {
      context: "ctx",
      documentId: "doc",
      updateMode: "append",
      observationScopes: [["repo:abc"]],
      async: true,
    });

    expect(mocks.retain).toHaveBeenCalledWith(
      "bank",
      "content",
      expect.objectContaining({
        context: "ctx",
        documentId: "doc",
        updateMode: "append",
        observationScopes: [["repo:abc"]],
        async: true,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mocks.retainBatch).not.toHaveBeenCalled();
  });

  it("keeps retainBatch fallback when document tags are present", async () => {
    const { createHindsightClient } = await import("../extensions/client/client.js");
    const client = createHindsightClient(DEFAULT_CONFIG);

    await client.retain("bank", "content", {
      context: "ctx",
      documentId: "doc",
      documentTags: ["doc:tag"],
      updateMode: "append",
      observationScopes: [["repo:abc"]],
      async: false,
    });

    expect(mocks.retain).not.toHaveBeenCalled();
    expect(mocks.retainBatch).toHaveBeenCalledWith(
      "bank",
      [
        expect.objectContaining({
          content: "content",
          context: "ctx",
          document_id: "doc",
          update_mode: "append",
          observation_scopes: [["repo:abc"]],
        }),
      ],
      expect.objectContaining({
        async: false,
        documentTags: ["doc:tag"],
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("validates creation IDs without blocking access to existing IDs", async () => {
    const { createHindsightClient } = await import("../extensions/client/client.js");
    const client = createHindsightClient(DEFAULT_CONFIG);

    await expect(client.createBank!("bad/bank")).rejects.toThrow("must not contain '/'");
    await expect(
      client.createMentalModel!("bank", "Model", "query", { id: "bad/id" }),
    ).rejects.toThrow("must not contain '/'");
    expect(mocks.createBank).not.toHaveBeenCalled();
    expect(mocks.createMentalModel).not.toHaveBeenCalled();

    await client.createBank!("Team Notes");
    await client.getMentalModel!("bank", "legacy/id");
    await client.updateMentalModel!("bank", "legacy/id", { name: "Updated" });
    await client.refreshMentalModel!("bank", "legacy/id");
    await client.deleteMentalModel!("bank", "legacy/id", { dryRun: false });
    await client.getBankConfig!("legacy/bank");
    await client.updateBankConfig!("legacy/bank", { retainMission: "Updated" });
    expect(mocks.createBank).toHaveBeenCalledOnce();
    expect(mocks.getMentalModel).toHaveBeenCalledWith("bank", "legacy/id", expect.anything());
    expect(mocks.updateMentalModel).toHaveBeenCalledWith("bank", "legacy/id", expect.anything());
    expect(mocks.refreshMentalModel).toHaveBeenCalledWith("bank", "legacy/id", expect.anything());
    expect(mocks.deleteMentalModel).toHaveBeenCalledWith("bank", "legacy/id", expect.anything());
    expect(mocks.getBankConfig).toHaveBeenCalledWith("legacy/bank", expect.anything());
    expect(mocks.updateBankConfig).toHaveBeenCalledWith("legacy/bank", expect.anything());
  });

  it.each([255, 8193])(
    "rejects page and model token budgets before SDK calls: %i",
    async (maxTokens) => {
      const { createHindsightClient } = await import("../extensions/client/client.js");
      const client = createHindsightClient(DEFAULT_CONFIG);
      await expect(
        client.createMentalModel!("bank", "Model", "query", { maxTokens }),
      ).rejects.toThrow("256 and 8192");
      await expect(client.updateMentalModel!("bank", "model", { maxTokens })).rejects.toThrow(
        "256 and 8192",
      );
      await expect(
        client.createKnowledgePage!("bank", "Page", "query", { maxTokens }),
      ).rejects.toThrow("256 and 8192");
      await expect(client.updateKnowledgeNode!("bank", "page", { maxTokens })).rejects.toThrow(
        "256 and 8192",
      );
      expect(mocks.createMentalModel).not.toHaveBeenCalled();
      expect(mocks.updateMentalModel).not.toHaveBeenCalled();
      expect(mocks.createKnowledgePage).not.toHaveBeenCalled();
      expect(mocks.updateKnowledgeNode).not.toHaveBeenCalled();
    },
  );

  it("wraps mental-model and bank-config control-plane methods", async () => {
    const { createHindsightClient } = await import("../extensions/client/client.js");
    const client = createHindsightClient(DEFAULT_CONFIG);

    await client.listMentalModels!("bank", { tags: ["project:a"], detail: "metadata" });
    expect(mocks.listMentalModels).toHaveBeenCalledWith(
      "bank",
      expect.objectContaining({
        tags: ["project:a"],
        detail: "metadata",
        signal: expect.any(AbortSignal),
      }),
    );

    await client.getMentalModel!("bank", "mm1");
    expect(mocks.getMentalModel).toHaveBeenCalledWith(
      "bank",
      "mm1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await client.createMentalModel!("bank", "Arch", "query", { tags: ["source:pi"] });
    expect(mocks.createMentalModel).toHaveBeenCalledWith(
      "bank",
      "Arch",
      "query",
      expect.objectContaining({ tags: ["source:pi"], signal: expect.any(AbortSignal) }),
    );

    await client.updateMentalModel!("bank", "mm1", { name: "Arch2" });
    expect(mocks.updateMentalModel).toHaveBeenCalledWith(
      "bank",
      "mm1",
      expect.objectContaining({ name: "Arch2", signal: expect.any(AbortSignal) }),
    );

    await client.refreshMentalModel!("bank", "mm1");
    expect(mocks.refreshMentalModel).toHaveBeenCalledWith(
      "bank",
      "mm1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    const dry = await client.deleteMentalModel!("bank", "mm1", { dryRun: true });
    expect(dry).toMatchObject({ dryRun: true, wouldDelete: true });
    expect(mocks.deleteMentalModel).not.toHaveBeenCalled();

    await client.deleteMentalModel!("bank", "mm1", { dryRun: false });
    expect(mocks.deleteMentalModel).toHaveBeenCalledWith(
      "bank",
      "mm1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await client.updateBankConfig!("bank", { retainMission: "code" });
    expect(mocks.updateBankConfig).toHaveBeenCalledWith(
      "bank",
      expect.objectContaining({ retainMission: "code", signal: expect.any(AbortSignal) }),
    );

    await client.getBankConfig!("bank");
    expect(mocks.getBankConfig).toHaveBeenCalledWith(
      "bank",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("wraps knowledge-page control-plane methods from hindsight-client 0.9", async () => {
    const { createHindsightClient } = await import("../extensions/client/client.js");
    const client = createHindsightClient(DEFAULT_CONFIG);

    await client.getKnowledgeBaseTree!("bank");
    expect(mocks.getKnowledgeBaseTree).toHaveBeenCalledWith(
      "bank",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await client.createKnowledgeFolder!("bank", "Specs", { parentId: null });
    expect(mocks.createKnowledgeFolder).toHaveBeenCalledWith(
      "bank",
      "Specs",
      expect.objectContaining({ parentId: null, signal: expect.any(AbortSignal) }),
    );

    await client.createKnowledgePage!("bank", "API", "What is the API shape?", {
      tags: ["type:component"],
      trigger: {
        mode: "delta",
        factTypes: ["observation"],
        excludeMentalModels: true,
        refreshAfterConsolidation: true,
        tagsMatch: "all_strict",
      },
    });
    expect(mocks.createKnowledgePage).toHaveBeenCalledWith(
      "bank",
      "API",
      "What is the API shape?",
      expect.objectContaining({
        tags: ["type:component"],
        trigger: expect.objectContaining({ tagsMatch: "all_strict" }),
        signal: expect.any(AbortSignal),
      }),
    );

    await client.getKnowledgePage!("bank", "page1");
    expect(mocks.getKnowledgePage).toHaveBeenCalledWith(
      "bank",
      "page1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await client.searchKnowledgeBase!("bank", "routing", { limit: 5 });
    expect(mocks.searchKnowledgeBase).toHaveBeenCalledWith(
      "bank",
      "routing",
      expect.objectContaining({ limit: 5, signal: expect.any(AbortSignal) }),
    );

    await client.updateKnowledgeNode!("bank", "page1", { name: "API v2" });
    expect(mocks.updateKnowledgeNode).toHaveBeenCalledWith(
      "bank",
      "page1",
      expect.objectContaining({ name: "API v2", signal: expect.any(AbortSignal) }),
    );

    await client.deleteKnowledgeNode!("bank", "page1");
    expect(mocks.deleteKnowledgeNode).toHaveBeenCalledWith(
      "bank",
      "page1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await client.exportKnowledgeBase!("bank");
    expect(mocks.exportKnowledgeBase).toHaveBeenCalledWith(
      "bank",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
