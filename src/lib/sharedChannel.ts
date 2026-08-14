type ChannelListener = (event: MessageEvent) => void;

type SharedChannel = {
  channel: BroadcastChannel;
  listeners: Set<ChannelListener>;
};

const channels = new Map<string, SharedChannel>();

const getSharedChannel = (name: string): SharedChannel | null => {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  const existing = channels.get(name);
  if (existing) return existing;

  try {
    const shared: SharedChannel = {
      channel: new BroadcastChannel(name),
      listeners: new Set(),
    };
    shared.channel.onmessage = (event) => {
      shared.listeners.forEach((listener) => listener(event));
    };
    channels.set(name, shared);
    return shared;
  } catch {
    return null;
  }
};

export const subscribeSharedChannel = (name: string, listener: ChannelListener): (() => void) => {
  const shared = getSharedChannel(name);
  if (!shared) return () => {};
  shared.listeners.add(listener);
  return () => shared.listeners.delete(listener);
};

export const postSharedMessage = (name: string, data: unknown): void => {
  const shared = getSharedChannel(name);
  if (!shared) return;
  try {
    shared.channel.postMessage(data);
  } catch {
    // Ignore unavailable or closed browser channels.
  }
};

export const closeSharedChannels = (): void => {
  channels.forEach(({ channel }) => channel.close());
  channels.clear();
};
