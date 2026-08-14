import { Bot, Check, Download, Menu, Save, Upload } from "lucide-react";
import { useRef } from "react";

import type { Chatbot } from "../../entities/chatbot/types";
import { Button, IconButton, StatusDot, VisuallyHidden } from "../../shared/ui";

interface Props {
  chatbot: Chatbot | null;
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  onToggleNav: () => void;
  onSave: () => void;
  onTogglePublished: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

/**
 * Identity of the open chatbot on the left, the actions that change it on the
 * right. Holds no state beyond the hidden file input it has to own.
 */
export function BuilderTopbar({
  chatbot,
  dirty,
  saving,
  publishing,
  onToggleNav,
  onSave,
  onTogglePublished,
  onExport,
  onImport,
}: Props) {
  const importRef = useRef<HTMLInputElement>(null);
  const published = chatbot?.status === "published";

  return (
    <header className="builder-topbar">
      <div className="builder-brand">
        <Bot size={21} aria-hidden />
        <strong>WebChatBots</strong>
        <span>Builder</span>
      </div>

      <IconButton
        label="Show chatbots"
        icon={<Menu size={19} />}
        onClick={onToggleNav}
        className="mobile-menu"
      />

      <div className="builder-current">
        <StatusDot status={chatbot?.status ?? "draft"} />
        <strong>{chatbot?.name ?? "No chatbot selected"}</strong>
        {chatbot ? <span>v{chatbot.current_version ?? 1}</span> : null}
      </div>

      <div className="builder-actions">
        <IconButton
          label="Import JSON"
          icon={<Upload size={17} />}
          disabled={!chatbot}
          onClick={() => importRef.current?.click()}
        />
        <VisuallyHidden>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              // Reset so re-importing the same file fires change again.
              event.target.value = "";
            }}
          />
        </VisuallyHidden>

        <IconButton
          label="Export JSON"
          icon={<Download size={17} />}
          disabled={!chatbot}
          onClick={onExport}
        />

        <Button
          size="sm"
          disabled={!chatbot || publishing}
          onClick={onTogglePublished}
          icon={published ? <Check size={16} /> : undefined}
        >
          {published ? "Published" : "Publish"}
        </Button>

        <Button
          size="sm"
          variant="primary"
          disabled={!dirty || !chatbot}
          loading={saving}
          onClick={onSave}
          icon={<Save size={16} />}
        >
          Save
        </Button>
      </div>
    </header>
  );
}
