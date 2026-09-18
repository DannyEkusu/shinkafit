// Minimal mobile nav toggle. No dependencies.
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!toggle || !links) return;

  toggle.addEventListener("click", () => {
    const isOpen = links.classList.toggle("nav-links-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
});
