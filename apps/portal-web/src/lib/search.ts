import { authorizedBackendJson } from "./auth";

export const PORTAL_SEARCH_INDICES = ["documents", "tasks", "messages"] as const;

export type PortalSearchIndex = (typeof PORTAL_SEARCH_INDICES)[number];

export type PortalSearchHit = {
  index: PortalSearchIndex;
  id: string;
  score: number;
  title: string;
  body: string | null;
  classification: number | null;
  updatedAt: string | null;
  href: string | null;
  highlights: Record<string, string[]> | null;
  raw: Record<string, unknown>;
};

export type PortalSearchResult = {
  total: number;
  took: number;
  hits: PortalSearchHit[];
};

function normalizeIndex(value: unknown): PortalSearchIndex {
  if (value === "documents" || value === "tasks" || value === "messages") {
    return value;
  }

  return "documents";
}

function buildHitHref(index: PortalSearchIndex, id: string) {
  switch (index) {
    case "documents":
      return `/edms/${id}`;
    case "tasks":
      return `/tasks/${id}`;
    case "messages":
      return null;
  }
}

function pickTitle(index: PortalSearchIndex, source: Record<string, unknown>) {
  switch (index) {
    case "documents":
      return String(source.subject ?? source.registrationNumber ?? source.id ?? "Document");
    case "tasks":
      return String(source.title ?? source.id ?? "Task");
    case "messages":
      return String(source.body ?? source.id ?? "Message");
  }
}

function pickBody(index: PortalSearchIndex, source: Record<string, unknown>) {
  switch (index) {
    case "documents":
      return typeof source.body === "string" ? source.body : null;
    case "tasks":
      return typeof source.description === "string" ? source.description : null;
    case "messages":
      return typeof source.body === "string" ? source.body : null;
  }
}

export async function runGlobalSearch(input: {
  q: string;
  indices?: PortalSearchIndex[];
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  params.set("q", input.q);
  params.set("limit", String(input.limit ?? 20));
  params.set("offset", String(input.offset ?? 0));
  for (const index of input.indices ?? PORTAL_SEARCH_INDICES) {
    params.append("indices", index);
  }

  const response = await authorizedBackendJson<{
    total: number;
    took: number;
    hits: Array<{
      index: string;
      id: string;
      score: number;
      source: Record<string, unknown>;
    }>;
  }>(`/search?${params.toString()}`);

  return {
    total: response.total,
    took: response.took,
    hits: response.hits.map((hit) => {
      const index = normalizeIndex(hit.index);
      const source = hit.source ?? {};
      const highlights =
        source.highlights && typeof source.highlights === "object"
          ? (source.highlights as Record<string, string[]>)
          : null;

      return {
        index,
        id: hit.id,
        score: hit.score,
        title: pickTitle(index, source),
        body: pickBody(index, source),
        classification:
          typeof source.classification === "number" ? source.classification : null,
        updatedAt:
          typeof source.updatedAt === "string"
            ? source.updatedAt
            : typeof source.createdAt === "string"
              ? source.createdAt
              : null,
        href: buildHitHref(index, hit.id),
        highlights,
        raw: source,
      };
    }),
  } satisfies PortalSearchResult;
}
