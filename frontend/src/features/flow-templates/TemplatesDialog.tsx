import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot } from "../../entities/chatbot/types";
import { Button, Dialog, useToast } from "../../shared/ui";
import { FLOW_TEMPLATES, type FlowTemplate } from "./templates";

interface Props { open: boolean; chatbot: Chatbot | null; onClose: () => void; }

export function TemplatesDialog({ open, chatbot, onClose }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();

  const apply = useMutation({
    mutationFn: (template: FlowTemplate) => chatbotApi.saveFlow(chatbot!.id, template.build()),
    onSuccess: async (flow) => {
      await client.invalidateQueries({ queryKey: ["flow", chatbot?.id] });
      await client.invalidateQueries({ queryKey: ["versions", chatbot?.id] });
      toast.success(`Template applied as version ${flow.version}`);
      onClose();
      navigate(`/builder/${chatbot!.id}`);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not apply template"),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Chat flow templates" icon={<Layers size={18} />}>
      <p className="form-hint">Applying a template saves a new flow version for <strong>{chatbot?.name ?? "the selected chatbot"}</strong>. Earlier versions stay in History.</p>
      <div className="template-list">
        {FLOW_TEMPLATES.map((template) => (
          <div key={template.id} className="template-card">
            <div>
              <strong>{template.name}</strong>
              <p>{template.description}</p>
              <div className="template-nodes">{template.nodeTypes.map((t) => <span key={t}>{t.replaceAll("_", " ")}</span>)}</div>
            </div>
            <Button size="sm" variant="primary" disabled={!chatbot || apply.isPending} loading={apply.isPending && apply.variables?.id === template.id} onClick={() => apply.mutate(template)}>
              Use template
            </Button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
