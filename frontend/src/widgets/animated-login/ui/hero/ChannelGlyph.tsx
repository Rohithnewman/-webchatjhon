import { Camera, Globe, MessageCircle, MessagesSquare } from "lucide-react";
import type { ReactNode } from "react";

import { CHANNELS, type ChannelId } from "../../model/story";

/**
 * One channel, one mark — used by both the incoming conversation cards and the
 * Inbox rows they turn into.
 *
 * Sharing it is the point: a conversation that arrives on Instagram has to be
 * recognisably the same conversation once Ambot365 has filed it, otherwise the
 * "every channel lands in one inbox" claim doesn't read.
 *
 * lucide ships no brand marks, so the camera stands in for Instagram.
 */
const GLYPH: Record<ChannelId, (size: number) => ReactNode> = {
  whatsapp: (size) => <MessageCircle size={size} aria-hidden />,
  instagram: (size) => <Camera size={size} aria-hidden />,
  messenger: (size) => <MessagesSquare size={size} aria-hidden />,
  webchat: (size) => <Globe size={size} aria-hidden />,
};

export function ChannelGlyph({ channel, size = 13 }: { channel: ChannelId; size?: number }) {
  return GLYPH[channel](size);
}

export const channelTint = (channel: ChannelId) => CHANNELS[channel].tint;
export const channelLabel = (channel: ChannelId) => CHANNELS[channel].label;
