import { spawn } from 'node:child_process';

/** Opens the default browser. Failure is harmless: the URL is also printed. */
export function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'win32'
      ? (['cmd', ['/c', 'start', '', url]] as const)
      : process.platform === 'darwin'
        ? (['open', [url]] as const)
        : (['xdg-open', [url]] as const);
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Nothing to do: the address is printed for the player to open by hand.
  }
}
