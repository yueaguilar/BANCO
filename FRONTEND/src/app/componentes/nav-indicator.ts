export function iniciarNavIndicador(): () => void {
  const nav = document.querySelector('.bottom-nav');
  const indicator = nav?.querySelector<HTMLElement>('.nav-indicator');
  const items = Array.from(nav?.querySelectorAll<HTMLAnchorElement>('.nav-item') ?? []);
  if (!nav || !indicator || !items.length) return () => {};

  const mover = (target: HTMLElement) => {
    const navRect = nav.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    indicator.style.width = `${targetRect.width}px`;
    indicator.style.transform = `translateX(${targetRect.left - navRect.left}px)`;
  };

  const normalizarRuta = (ruta: string): string =>
    ruta.length > 1 ? ruta.replace(/\/+$/, '') : ruta;

  const activar = (target: HTMLAnchorElement): void => {
    items.forEach((item) => item.classList.toggle('active', item === target));
    mover(target);
  };

  const sincronizarRuta = (): void => {
    const currentPath = normalizarRuta(window.location.pathname);
    const currentItem = items.find((item) =>
      normalizarRuta(new URL(item.href).pathname) === currentPath
    ) ?? items[0];
    activar(currentItem);
  };

  sincronizarRuta();
  const onResize = (): void => {
    const activeItem = nav.querySelector<HTMLAnchorElement>('.nav-item.active') ?? items[0];
    mover(activeItem);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('popstate', sincronizarRuta);

  const listeners = new Map<HTMLAnchorElement, () => void>();
  items.forEach((item) => {
    const onClick = (): void => activar(item);
    item.addEventListener('click', onClick);
    listeners.set(item, onClick);
  });

  return () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('popstate', sincronizarRuta);
    listeners.forEach((listener, item) => item.removeEventListener('click', listener));
  };
}