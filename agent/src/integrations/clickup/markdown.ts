import type { Ticket } from "../../pipeline/sow-project/types.js";

/**
 * Renders a Ticket into the markdown description body that gets sent
 * to ClickUp. Includes description, acceptance criteria, implementation
 * notes, estimate, and a context footer.
 */
export function buildTaskDescription(
  ticket: Ticket,
  context: { phaseName: string; epicName: string; sourcePath: string },
): string {
  const lines: string[] = [];

  if (ticket.description) {
    lines.push(ticket.description.trim());
    lines.push("");
  }

  if (ticket.acceptanceCriteria.length > 0) {
    lines.push("**Acceptance criteria**");
    for (const ac of ticket.acceptanceCriteria) {
      lines.push(`- ${ac}`);
    }
    lines.push("");
  }

  if (ticket.implementationNotes?.trim()) {
    lines.push("**Implementation notes**");
    lines.push(ticket.implementationNotes.trim());
    lines.push("");
  }

  if (ticket.subtasks.length > 0) {
    lines.push("**Subtasks**");
    for (const sub of ticket.subtasks) {
      lines.push(
        sub.description ? `- ${sub.title} — ${sub.description}` : `- ${sub.title}`,
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(
    `_Phase:_ ${context.phaseName} · _Epic:_ ${context.epicName} · ` +
      `_Estimate:_ ${formatEstimate(ticket.estimateDays)} · ` +
      `_Source:_ ${baseName(context.sourcePath)}`,
  );
  return lines.join("\n").trim();
}

/**
 * Renders a subtask's body when it gets created as its own ClickUp task.
 */
export function buildSubtaskDescription(
  subtask: { title: string; description?: string },
  parentTitle: string,
): string {
  const lines: string[] = [];
  if (subtask.description) lines.push(subtask.description.trim());
  lines.push("");
  lines.push(`_Subtask of:_ ${parentTitle}`);
  return lines.join("\n").trim();
}

function formatEstimate(days: number): string {
  if (days >= 1) {
    const rounded = Math.round(days * 10) / 10;
    return `${rounded}d`;
  }
  return `${Math.round(days * 8)}h`;
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}
