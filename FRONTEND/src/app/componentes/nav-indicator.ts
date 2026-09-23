export function iniciarNavIndicador(): () => void {
  const nav = document.querySelector('.bottom-nav');
  const indicator = nav?.querySelector<HTMLElement>('.nav-indicator');
  const items = Array.from(nav?.querySelectorAll<HTMLElement>('.nav-item') ?? []);
  if (!nav || !indicator || !items.length) return () => {};

  const mover = (target: HTMLElement) => {
    const navRect = nav.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    indicator.style.width = `${targetRect.width}px`;
    indicator.style.transform = `translateX(${targetRect.left - navRect.left}px)`;
  };

  const activo = () =>
    document.querySelector<HTMLElement>('.nav-item.active') ?? items[0];

  mover(activo());

  const onResize = () => mover(activo());
  window.addEventListener('resize', onResize);

  items.forEach((item) => {
    item.addEventListener('click', () => {
      items.forEach((el) => el.classList.remove('active'));
      item.classList.add('active');
      mover(item);
    });
  });

  return () => window.removeEventListener('resize', onResize);
}