import { createFileRoute } from "@tanstack/react-router";
import { BulkKanbanBoard } from "@/components/BulkKanbanBoard";

export const Route = createFileRoute("/_authenticated/kanban-captacao-massa")({
  component: () => <BulkKanbanBoard mode="captacao" />,
});
