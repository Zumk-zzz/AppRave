import { colors } from '@/src/theme';
type MiniApp = { initData?: string; ready: () => void; expand: () => void; setHeaderColor: (color: string) => void; setBackgroundColor: (color: string) => void };
function miniApp(): MiniApp | undefined { return (window as Window & { Telegram?: { WebApp?: MiniApp } }).Telegram?.WebApp; }
export function telegramInitData(): string | null {
  if (typeof window === 'undefined') return null;
  return miniApp()?.initData || new URLSearchParams(window.location.hash.slice(1)).get('tgWebAppData') || new URLSearchParams(window.location.search).get('tgWebAppData');
}
export function initializeTelegram() {
  if (typeof window === 'undefined' || !telegramInitData()) return;
  const ready = () => { const app = miniApp(); app?.ready(); app?.expand(); app?.setHeaderColor(colors.bg); app?.setBackgroundColor(colors.bg); };
  if (miniApp()) { ready(); return; }
  if (document.getElementById('telegram-mini-app-sdk')) return;
  const script = document.createElement('script');
  script.id = 'telegram-mini-app-sdk'; script.src = 'https://telegram.org/js/telegram-web-app.js?64';
  script.onload = ready; document.head.appendChild(script);
}
