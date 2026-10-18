const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const queue: (() => void)[] = [];
if (channel) channel.port1.onmessage = () => queue.shift()?.();

/**
 * Let the browser paint and handle input between chunks of long work.
 * Unlike requestAnimationFrame (paused in background tabs) or setTimeout
 * (throttled to 1 s there), a MessageChannel task keeps loading moving.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (!channel) {
      setTimeout(resolve, 0);
      return;
    }
    queue.push(resolve);
    channel.port2.postMessage(null);
  });
}
