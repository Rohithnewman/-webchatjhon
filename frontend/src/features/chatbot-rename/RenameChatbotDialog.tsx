import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot } from "../../entities/chatbot/types";
import { Button, Dialog, Field, Input, useToast } from "../../shared/ui";

const MAX = 50;
const schema = z.object({ name: z.string().trim().min(1, "Enter a name").max(MAX, `Keep it under ${MAX} characters`) });
type FormData = z.infer<typeof schema>;
const FORM_ID = "rename-chatbot-form";

interface Props { chatbot: Chatbot | null; onClose: () => void }

export function RenameChatbotDialog({ chatbot, onClose }: Props) {
  const toast = useToast();
  const client = useQueryClient();
  const { register, handleSubmit, reset, watch, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema), mode: "onChange", defaultValues: { name: chatbot?.name ?? "" },
  });
  useEffect(() => { reset({ name: chatbot?.name ?? "" }); }, [chatbot, reset]);
  const length = watch("name").length;

  const rename = useMutation({
    mutationFn: (data: FormData) => chatbotApi.update(chatbot!.id, { name: data.name }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["chatbots"] }); toast.success("Chatbot renamed"); onClose(); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not rename"),
  });

  return (
    <Dialog
      open={Boolean(chatbot)}
      onClose={onClose}
      title="Edit Internal Chatbot Name"
      icon={<Pencil size={20} aria-hidden />}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={rename.isPending} disabled={!isValid}>Save</Button>
        </>
      }
    >
      <p className="dialog-subtitle">Edit the name of your chatbot for better identification and management</p>
      <form id={FORM_ID} onSubmit={handleSubmit((data) => rename.mutate(data))}>
        <Field label="Edit Chatbot Name" error={errors.name?.message} hint={`${length}/${MAX}`}>
          <Input autoFocus {...register("name")} />
        </Field>
      </form>
      <div className="dialog-info-box">
        ⓘ This name is for internal management only and is different from the name your customers see.
        To update the customer-facing display name, <Link to={`/chatbots/${chatbot?.id ?? ""}/design`}>edit it in Chatbot Design Settings</Link>.
      </div>
    </Dialog>
  );
}
