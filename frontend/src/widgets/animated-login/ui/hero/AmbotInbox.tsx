import {
  ArrowLeftRight,
  Bot,
  ChartColumn,
  ChevronDown,
  CircleCheck,
  Ellipsis,
  EllipsisVertical,
  Funnel,
  House,
  Inbox,
  Monitor,
  Search,
  Sparkles,
  Tag,
  Trash2,
  UserX,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CONVERSATIONS, type ChannelId } from "../../model/story";
import { useStoryClock, useStoryFrame } from "../../model/story-clock";
import { ChannelGlyph, channelLabel, channelTint } from "./ChannelGlyph";
import styles from "./AmbotInbox.module.css";

/**
 * The Inbox is drawn at this width and scaled to whatever the stage gives it,
 * so the replica keeps the product's real proportions instead of being
 * re-laid-out into something that only resembles it.
 */
const FRAME_WIDTH = 470;

/** How far past 1:1 the replica may be blown up before it starts to look fake. */
const MAX_SCALE = 1.25;

const NAV = [
  { icon: <House size={13} aria-hidden />, label: "Home" },
  { icon: <Bot size={13} aria-hidden />, label: "Chatbot" },
  { icon: <Inbox size={13} aria-hidden />, label: "Inbox", active: true },
  { icon: <ChartColumn size={13} aria-hidden />, label: "Analytics" },
  { icon: <Monitor size={13} aria-hidden />, label: "Subscriptions" },
  { icon: <Users size={13} aria-hidden />, label: "Partner" },
  { icon: <Ellipsis size={13} aria-hidden />, label: "More" },
];

const TABS = ["Chats", "Appointments", "Contacts", "Groups"];

/**
 * Sample workspace history sitting below whatever arrives this loop.
 *
 * Invented contacts, addresses and numbers — a login page is public, so nothing
 * here may be a real customer record.
 */
const EXISTING_ROWS = [
  {
    id: "e1",
    name: "Ananya Rao",
    channel: "instagram" as ChannelId,
    at: "Aug 1, 2026 9:54 AM",
    email: "ananya.rao@lum...",
    phone: "+91 90000 41188",
    unread: 0,
  },
  {
    id: "e2",
    name: "Marcus Lee",
    channel: "webchat" as ChannelId,
    at: "Jul 31, 2026 10:21 PM",
    email: "m.lee@northwin...",
    phone: "NA",
    unread: 0,
  },
  {
    id: "e3",
    name: "Fatima Sheikh",
    channel: "whatsapp" as ChannelId,
    at: "Jul 31, 2026 9:06 PM",
    email: "fatima@brightla...",
    phone: "+91 90000 77410",
    unread: 5,
  },
  {
    id: "e4",
    name: "Rahul Menon",
    channel: "messenger" as ChannelId,
    at: "Jul 31, 2026 6:00 PM",
    email: "NA",
    phone: "NA",
    unread: 0,
  },
];

const RESOLVED_DETAIL: Record<string, { email: string; phone: string; at: string }> = {
  c1: { email: "john.doe@vertex...", phone: "+91 90000 12233", at: "Today 11:42 AM" },
  c2: { email: "sarah.w@brightl...", phone: "NA", at: "Today 11:40 AM" },
  c3: { email: "NA", phone: "+91 90000 04411", at: "Today 11:38 AM" },
  c4: { email: "priya.nair@lum...", phone: "+91 90000 30012", at: "Today 11:35 AM" },
};

function Row({
  name,
  channel,
  at,
  email,
  phone,
  unread,
  resolved,
  fresh,
}: {
  name: string;
  channel: ChannelId;
  at: string;
  email: string;
  phone: string;
  unread: number;
  resolved?: boolean;
  fresh?: boolean;
}) {
  return (
    <li className={`${styles.row} ${fresh ? styles.rowFresh : ""}`}>
      <span className={styles.check} />

      <span className={styles.visitor}>
        <span className={styles.avatar} />
        <span className={styles.visitorText}>
          <span className={styles.visitorTop}>
            <strong>{name}</strong>
            <span className={styles.countChip}>1</span>
            {/* The channel the conversation actually came in on. Four sources,
                one inbox — that only reads if the row says which. */}
            <span
              className={styles.channel}
              style={{ ["--tint" as string]: channelTint(channel) }}
              title={channelLabel(channel)}
            >
              <ChannelGlyph channel={channel} size={11} />
              {unread > 0 ? <i className={styles.unread}>{unread}</i> : null}
            </span>
          </span>
          <span className={styles.stamp}>{at}</span>
        </span>
      </span>

      <span className={styles.cell}>{email}</span>
      <span className={`${styles.cell} ${phone === "NA" ? "" : styles.link}`}>{phone}</span>

      <span className={styles.aiCell}>
        <span className={styles.ai}>
          <Sparkles size={10} aria-hidden />
        </span>
      </span>

      <span className={`${styles.status} ${resolved ? styles.statusDone : ""}`}>
        {resolved ? "Resolved" : "Open"}
        <ChevronDown size={9} aria-hidden />
      </span>

      <span className={styles.actions}>
        <Trash2 size={11} aria-hidden />
        <EllipsisVertical size={11} aria-hidden />
      </span>
    </li>
  );
}

/**
 * Ambot365's Inbox, rebuilt as live UI.
 *
 * This is the payoff of the story, so it is the real product screen rather than
 * a generic dashboard: the same rail, tabs, toolbar and conversation table.
 * Every conversation WebChatBot resolves is inserted at the top of the list
 * already marked resolved — which is the whole promise, shown rather than
 * described.
 */
export function AmbotInbox() {
  const { phase } = useStoryClock();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const measure = () => setScale(Math.min(MAX_SCALE, node.clientWidth / FRAME_WIDTH));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useStoryFrame((frame) => {
    const node = rootRef.current;
    if (node) node.style.setProperty("--reset", frame.reset.toFixed(3));
  });

  const resolved = CONVERSATIONS.slice(0, phase.resolvedCount).reverse();

  return (
    <div className={styles.root} ref={rootRef} style={{ ["--reset" as string]: 0 }}>
      <div
        className={styles.frame}
        style={{ width: FRAME_WIDTH, transform: `scale(${scale})` }}
      >
        <aside className={styles.rail}>
          <span className={styles.logo} aria-hidden />
          <ul className={styles.nav}>
            {NAV.map((item) => (
              <li key={item.label} className={item.active ? styles.navActive : styles.navItem}>
                {item.icon}
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className={styles.main}>
          <h3 className={styles.title}>Inbox</h3>

          <nav className={styles.tabs}>
            {TABS.map((tab, index) => (
              <span key={tab} className={index === 0 ? styles.tabActive : styles.tab}>
                {tab}
              </span>
            ))}
          </nav>

          <div className={styles.toolbar}>
            <span className={styles.toolButton}>
              <Funnel size={12} aria-hidden />
            </span>
            <span className={styles.toolButton}>
              <ArrowLeftRight size={12} aria-hidden />
            </span>
            <span className={styles.search}>
              <Search size={11} aria-hidden />
              Type name, email or phone, and press enter
            </span>
            <span className={styles.toolGhost}>
              <CircleCheck size={11} aria-hidden />
            </span>
            <span className={styles.toolGhost}>
              <UserX size={11} aria-hidden />
            </span>
            <span className={styles.toolGhost}>
              <Tag size={11} aria-hidden />
            </span>
            <span className={styles.toolGhost}>
              <Trash2 size={11} aria-hidden />
            </span>
          </div>

          <div className={styles.table}>
            <div className={styles.thead}>
              <span className={styles.check} />
              <span>Visitor Name</span>
              <span>Email</span>
              <span>Phone Number</span>
              <span>AI Summary</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            <ul className={styles.rows}>
              {resolved.map((conversation) => {
                const detail = RESOLVED_DETAIL[conversation.id];
                return (
                  <Row
                    key={conversation.id}
                    name={conversation.name}
                    channel={conversation.channel}
                    at={detail.at}
                    email={detail.email}
                    phone={detail.phone}
                    unread={conversation.badge}
                    resolved
                    fresh
                  />
                );
              })}
              {EXISTING_ROWS.map((row) => (
                <Row key={row.id} {...row} />
              ))}
            </ul>
          </div>
        </div>
      </div>

      <span className={styles.sweep} aria-hidden />
    </div>
  );
}
