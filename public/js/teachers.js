(() => {
  const search = document.querySelector('[data-staff-search]');
  const chips = document.querySelectorAll('[data-dept]');
  const groups = [...document.querySelectorAll('[data-dept-group]')];
  const empty = document.querySelector('[data-staff-empty]');
  let dept = '*';

  function apply() {
    const q = (search?.value || '').trim().toLowerCase();
    let shown = 0;
    groups.forEach((g) => {
      const inDept = dept === '*' || g.dataset.deptGroup === dept;
      let groupCount = 0;
      g.querySelectorAll('[data-search]').forEach((card) => {
        const match = inDept && (!q || card.dataset.search.includes(q));
        card.hidden = !match;
        if (match) groupCount++;
      });
      g.hidden = groupCount === 0;
      shown += groupCount;
    });
    if (empty) empty.hidden = shown > 0;
  }

  search?.addEventListener('input', apply);
  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      dept = chip.dataset.dept;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      apply();
    })
  );
})();
