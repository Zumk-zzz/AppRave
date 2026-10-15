// Веб-сессия живёт до закрытия вкладки. При статическом рендеринге window нет.
export async function getItemAsync(key: string): Promise<string | null> {
  return typeof window === 'undefined' ? null : window.sessionStorage.getItem(key);
}
export async function setItemAsync(key: string, value: string): Promise<void> {
  if (typeof window !== 'undefined') window.sessionStorage.setItem(key, value);
}
export async function deleteItemAsync(key: string): Promise<void> {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(key);
}
