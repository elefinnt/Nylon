import type { Prompter } from "../../cli/prompts.js";
import type { ClickUpClient, ClickUpList, ClickUpSpace, ClickUpWorkspace } from "./client.js";
import { paint } from "../../cli/render.js";

export interface PickedList {
  workspaceId: string;
  workspaceName: string;
  spaceId: string;
  spaceName: string;
  listId: string;
  listName: string;
}

/**
 * Interactive workspace → space → list picker using the existing
 * Prompter choice API. Returns the chosen list or null if the user
 * cancels at any level.
 */
export async function pickClickUpList(
  client: ClickUpClient,
  prompter: Prompter,
): Promise<PickedList | null> {
  // ── Workspace ────────────────────────────────────────────────────
  let workspaces: ClickUpWorkspace[];
  try {
    workspaces = await client.getWorkspaces();
  } catch (err: unknown) {
    throw new Error(`Failed to fetch ClickUp workspaces: ${(err as Error).message}`);
  }

  if (workspaces.length === 0) {
    throw new Error("No ClickUp workspaces found for this token.");
  }

  const workspaceId = await prompter.choice<string>(
    "Select workspace",
    [
      ...workspaces.map(w => ({ id: w.id, label: w.name })),
      { id: "cancel", label: paint.dim("Cancel") },
    ],
    {},
  );

  if (workspaceId === "cancel") return null;
  const ws = workspaces.find(w => w.id === workspaceId)!;

  // ── Space ─────────────────────────────────────────────────────────
  let spaces: ClickUpSpace[];
  try {
    spaces = await client.getSpaces(ws.id);
  } catch (err: unknown) {
    throw new Error(`Failed to fetch spaces: ${(err as Error).message}`);
  }

  if (spaces.length === 0) throw new Error(`No spaces found in workspace "${ws.name}".`);

  const spaceId = await prompter.choice<string>(
    "Select space",
    [
      ...spaces.map(s => ({ id: s.id, label: s.name })),
      { id: "back", label: paint.dim("← Back") },
    ],
    {},
  );

  if (spaceId === "back") return null;
  const space = spaces.find(s => s.id === spaceId)!;

  // ── List ──────────────────────────────────────────────────────────
  let lists: ClickUpList[];
  try {
    lists = await client.getLists(space.id);
  } catch (err: unknown) {
    throw new Error(`Failed to fetch lists: ${(err as Error).message}`);
  }

  if (lists.length === 0) throw new Error(`No lists found in space "${space.name}".`);

  const listId = await prompter.choice<string>(
    "Select list",
    [
      ...lists.map(l => ({
        id: l.id,
        label: l.folder ? `${l.folder} / ${l.name}` : l.name,
      })),
      { id: "back", label: paint.dim("← Back") },
    ],
    {},
  );

  if (listId === "back") return null;
  const list = lists.find(l => l.id === listId)!;

  return {
    workspaceId: ws.id,
    workspaceName: ws.name,
    spaceId: space.id,
    spaceName: space.name,
    listId: list.id,
    listName: list.folder ? `${list.folder} / ${list.name}` : list.name,
  };
}
