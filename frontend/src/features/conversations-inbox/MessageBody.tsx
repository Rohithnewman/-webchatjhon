import type { ConversationMessage } from "../../entities/conversation";

const YT = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/;

export function MessageBody({ message }: { message: ConversationMessage }) {
  const meta = message.meta ?? {};
  if (meta.kind === "image" && meta.url) return <img src={meta.url} alt={message.content} className="msg-media" />;
  if (meta.kind === "video" && meta.url) {
    const yt = YT.exec(meta.url);
    return yt ? <iframe className="msg-media" src={`https://www.youtube.com/embed/${yt[1]}`} title={message.content} allowFullScreen /> : <video className="msg-media" src={meta.url} controls />;
  }
  if (meta.kind === "link" && meta.url) return <a href={meta.url} target="_blank" rel="noopener noreferrer">{message.content}</a>;
  return (
    <>
      <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
      {meta.options?.length ? <div className="msg-options">{meta.options.map((o) => <span key={o} className="preview-opt-pill">{o}</span>)}</div> : null}
    </>
  );
}
