import { createFileRoute } from "@tanstack/react-router";
import { BulkKanbanBoard } from "@/components/BulkKanbanBoard";

export const Route = createFileRoute("/_authenticated/kanban-massa")({
  component: () => <BulkKanbanBoard mode="compra" />,
});
