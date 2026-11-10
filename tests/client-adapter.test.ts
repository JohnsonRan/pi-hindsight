import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../extensions/config/config.js";
import { PI_HINDSIGHT_USER_AGENT } from "../extensions/version.js";

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  retain: vi.fn(async () => ({ accepted: true })),
  retainBatch: vi.fn(async () => ({ accepted: true })),
  listMentalModels: vi.fn(async () => ({ mental_models: [] })),
  getMentalModel: vi.fn(async () => ({ id: "mm1" })),
  createMentalModel: vi.fn(async () => ({ id: "mm1" })),
  updateMentalModel: vi.fn(async () => ({ id: "mm1" })),
  refreshMentalModel: vi.fn(async () => ({ id: "mm1" })),
  deleteMentalModel: vi.fn(async () => undefined),
  getPageTree: vi.fn(async () => ({ nodes: [] })),
  createPageFolder: vi.fn(async () => ({ id: "folder1" })),
  createPage: vi.fn(async () => ({ id: "page1", operation_id: "op1" })),
  getPage: vi.fn(async () => ({ id: "page1", markdown: "# Page" })),
  searchPages: vi.fn(async () => ({ results: [] })),
  updatePageNode: vi.fn(async () => ({ id: "page1" })),
  deletePageNode: vi.fn(async () => undefined),
  exportPages: vi.fn(async () => ({ files: [] })),
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
        retain: mocks.retain,
        retainBatch: mocks.retainBatch,
        listMentalModels: mocks.listMentalModels,
        getMentalModel: mocks.getMentalModel,
        createMentalModel: mocks.createMentalModel,
        updateMentalModel: mocks.updateMentalModel,
        refreshMentalModel: mocks.refreshMentalModel,
        deleteMentalModel: mocks.deleteMentalModel,
        getPageTree: mocks.getPageTree,
        createPageFolder: mocks.createPageFolder,
        createPage: mocks.createPage,
        getPage: mocks.getPage,
        searchPages: mocks.searchPages,
        updatePageNode: mocks.updatePageNode,
        deletePageNode: mocks.deletePageNode,
        exportPages: mocks.exportPages,
        updateBankConfig: mocks.updateBankConfig,
        getBankConfig: mocks.getBankConfig,
      };
    }),
  };
});

describe("Hindsight client adapter", () => {
  beforeEach(() => {
    mocks.constructor.mockClear();
    mocks.retain.mockClear();
    mocks.retainBatch.mockClear();
    mocks.listMentalModels.mockClear();
    mocks.getMentalModel.mockClear();
    mocks.createMentalModel.mockClear();
    mocks.updateMentalModel.mockClear();
    mocks.refreshMentalModel.mockClear();
    mocks.deleteMentalModel.mockClear();
    mocks.getPageTree.mockClear();
    mocks.createPageFolder.mockClear();
    mocks.createPage.mockClear();
    mocks.getPage.mockClear();
    mocks.searchPages.mockClear();
    mocks.updatePageNode.mockClear();
    mocks.deletePageNode.mockClear();
    mocks.exportPages.mockClear();
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
    expect(mocks.getPageTree).toHaveBeenCalledWith(
      "bank",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await client.createKnowledgeFolder!("bank", "Specs", { parentId: null });
    expect(mocks.createPageFolder).toHaveBeenCalledWith(
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
    expect(mocks.createPage).toHaveBeenCalledWith(
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
    expect(mocks.getPage).toHaveBeenCalledWith(
      "bank",
      "page1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await client.searchKnowledgeBase!("bank", "routing", { limit: 5 });
    expect(mocks.searchPages).toHaveBeenCalledWith(
      "bank",
      "routing",
      expect.objectContaining({ limit: 5, signal: expect.any(AbortSignal) }),
    );

    await client.updateKnowledgeNode!("bank", "page1", { name: "API v2" });
    expect(mocks.updatePageNode).toHaveBeenCalledWith(
      "bank",
      "page1",
      expect.objectContaining({ name: "API v2", signal: expect.any(AbortSignal) }),
    );

    await client.deleteKnowledgeNode!("bank", "page1");
    expect(mocks.deletePageNode).toHaveBeenCalledWith(
      "bank",
      "page1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await client.exportKnowledgeBase!("bank");
    expect(mocks.exportPages).toHaveBeenCalledWith(
      "bank",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
