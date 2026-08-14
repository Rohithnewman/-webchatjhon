import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquarePlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button, Dialog, Field, Input, Textarea } from "../../../shared/ui";

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name for this chatbot").max(120),
  description: z.string().trim().max(500),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => Promise<void>;
}

const FORM_ID = "create-chatbot-form";

export function CreateChatbotDialog({ open, pending, onClose, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New chatbot"
      icon={<MessageSquarePlus size={20} aria-hidden />}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {/* `form` lets the action live in the footer while the form owns submit. */}
          <Button type="submit" form={FORM_ID} variant="primary" loading={pending}>
            Create chatbot
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={handleSubmit(async (data) => {
          await onSubmit(data);
          reset();
        })}
        style={{ display: "grid", gap: "var(--space-6)" }}
      >
        <Field label="Name" error={errors.name?.message}>
          <Input autoFocus {...register("name")} />
        </Field>

        <Field
          label="Description"
          optionalText="Optional"
          hint="What this chatbot is for. Only your team sees it."
          error={errors.description?.message}
        >
          <Textarea rows={3} {...register("description")} />
        </Field>
      </form>
    </Dialog>
  );
}
