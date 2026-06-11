(() => {
  const problems = document.getElementById('math-problems');
  if (!problems) return;

  const controls = problems.nextElementSibling;
  problems.remove();
  controls?.remove();
})();
