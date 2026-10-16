import { Game } from './core/Game';

async function boot(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app missing');
  const game = await Game.create(container);
  game.start();

  if (import.meta.env.DEV) {
    const { createDevGui } = await import('./debug/DevGui');
    await createDevGui(game);
    (window as unknown as { game: Game }).game = game;
  }
}

boot().catch((err: unknown) => {
  console.error(err);
  document.body.textContent = `Failed to start: ${String(err)}`;
});
