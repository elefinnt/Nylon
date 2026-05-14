import { version } from "../../version.js";
import { AgentError } from "../../util/errors.js";

const BASE_URL = "https://api.clickup.com/api/v2";

export interface ClickUpWorkspace {
  id: string;
  name: string;
}

export interface ClickUpSpace {
  id: string;
  name: string;
}

export interface ClickUpList {
  id: string;
  name: string;
  /** Parent folder name, if any. */
  folder?: string;
}

export interface ClickUpCreatedTask {
  id: string;
  name: string;
  url: string;
}

export interface CreateTaskInput {
  name: string;
  description?: string;
  /** Accepts the string form ("urgent"|"high"|"normal"|"low"); converted internally. */
  priority?: string;
  tags?: string[];
  /** ClickUp task id to attach this task to as a subtask. */
  parent?: string;
}

export interface ClickUpClientOptions {
  token: string;
}

function priorityNumber(p: string | undefined): 1 | 2 | 3 | 4 | undefined {
  switch (p) {
    case "urgent": return 1;
    case "high": return 2;
    case "normal": return 3;
    case "low": return 4;
    default: return undefined;
  }
}

export function createClickUpClient(opts: ClickUpClientOptions) {
  const headers = {
    Authorization: opts.token,
    "Content-Type": "application/json",
    "User-Agent": `nylon/${version}`,
  };

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      throw new AgentError(
        "CLICKUP_RATE_LIMITED",
        `ClickUp rate limit hit. Retry after ${retryAfter ?? "a moment"}.`,
      );
    }

    if (!res.ok) {
      let detail = "";
      try { detail = await res.text(); } catch { /* ignore */ }
      throw new AgentError(
        "CLICKUP_API_ERROR",
        `ClickUp API error ${res.status} on ${path}: ${detail.slice(0, 200)}`,
      );
    }

    return res.json() as Promise<T>;
  }

  return {
    /** Returns all workspaces the token has access to. */
    async getWorkspaces(): Promise<ClickUpWorkspace[]> {
      const data = await apiFetch<{ teams: Array<{ id: string; name: string }> }>("/team");
      return data.teams.map(t => ({ id: t.id, name: t.name }));
    },

    /** Returns all spaces in a workspace. */
    async getSpaces(workspaceId: string): Promise<ClickUpSpace[]> {
      const data = await apiFetch<{ spaces: Array<{ id: string; name: string }> }>(
        `/team/${workspaceId}/space?archived=false`,
      );
      return data.spaces.map(s => ({ id: s.id, name: s.name }));
    },

    /**
     * Returns all lists in a space — both lists inside folders and
     * folderless lists — flattened into one array.
     */
    async getLists(spaceId: string): Promise<ClickUpList[]> {
      const lists: ClickUpList[] = [];

      // Folderless lists
      const folderless = await apiFetch<{
        lists: Array<{ id: string; name: string }>;
      }>(`/space/${spaceId}/list?archived=false`);
      for (const l of folderless.lists) {
        lists.push({ id: l.id, name: l.name });
      }

      // Lists inside folders
      const folders = await apiFetch<{
        folders: Array<{ id: string; name: string; lists: Array<{ id: string; name: string }> }>;
      }>(`/space/${spaceId}/folder?archived=false`);
      for (const folder of folders.folders) {
        for (const l of folder.lists) {
          lists.push({ id: l.id, name: l.name, folder: folder.name });
        }
      }

      return lists;
    },

    /**
     * Creates a single task in a list. Returns the created task.
     * Set `input.parent` to attach the task as a subtask of an
     * existing parent task in the same list.
     */
    async createTask(listId: string, input: CreateTaskInput): Promise<ClickUpCreatedTask> {
      const body: Record<string, unknown> = { name: input.name };
      if (input.description) body["description"] = input.description;
      if (input.tags?.length) body["tags"] = input.tags.map(t => ({ name: t }));
      const prio = priorityNumber(input.priority as string | undefined);
      if (prio !== undefined) body["priority"] = prio;
      if (input.parent) body["parent"] = input.parent;

      const task = await apiFetch<{ id: string; name: string; url: string }>(
        `/list/${listId}/task`,
        { method: "POST", body: JSON.stringify(body) },
      );
      return { id: task.id, name: task.name, url: task.url };
    },
  };
}

export type ClickUpClient = ReturnType<typeof createClickUpClient>;
