import { Game } from './core/Game';
import { LoadingScreen } from './ui/LoadingScreen';

const loading = new LoadingScreen();

function webgl2Available(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function boot(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app missing');
  if (!webgl2Available()) {
    loading.fail('This game needs WebGL 2. Try a recent Chrome, Firefox, Edge or Safari, with hardware acceleration enabled.');
    return;
  }
  const game = await Game.create(container, (f, label) => loading.progress(f, label));
  game.start();
  loading.hide();

  if (import.meta.env.DEV) {
    const { createDevGui } = await import('./debug/DevGui');
    await createDevGui(game);
    (window as unknown as { game: Game }).game = game;
  }
}

boot().catch((err: unknown) => {
  console.error(err);
  loading.fail(`Something went wrong while starting: ${String(err)}`);
});
