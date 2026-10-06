(function () {
  'use strict';
  var byId = function (id) { return document.getElementById(id); };
  var math = window.SoftServeMath;

  // Local KaTeX assets keep the article usable without a CDN or network access.
  if (window.katex) {
    document.querySelectorAll('[data-tex]').forEach(function (element) {
      window.katex.render(element.dataset.tex, element, {
        displayMode: element.classList.contains('equation'),
        throwOnError: false,
        strict: 'warn'
      });
    });
  }

  var themeButton = byId('theme-toggle');
  var systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  var themePreference = null;
  try { themePreference = localStorage.getItem('softserve-theme'); } catch (_) {}
  if (themePreference !== 'light' && themePreference !== 'dark') themePreference = null;
  function setTheme(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    var label = 'Switch to ' + (dark ? 'light' : 'dark') + ' theme';
    themeButton.setAttribute('aria-label', label);
    themeButton.title = label;
    themeButton.setAttribute('aria-pressed', String(dark));
    byId('theme-name').textContent = dark ? 'Dark' : 'Light';
    document.querySelector('meta[name="theme-color"]').content = dark ? '#1b201e' : '#faf9f6';
  }
  setTheme(document.documentElement.dataset.theme === 'dark');
  themeButton.addEventListener('click', function () {
    var dark = document.documentElement.dataset.theme !== 'dark';
    setTheme(dark);
    themePreference = dark ? 'dark' : 'light';
    try { localStorage.setItem('softserve-theme', themePreference); } catch (_) {}
  });
  systemTheme.addEventListener('change', function (event) {
    if (themePreference === null) setTheme(event.matches);
  });

  // One outline serves as a sticky desktop rail and a compact mobile menu.
  var outline = byId('outline');
  var outlineSummary = outline.querySelector('summary');
  var wideLayout = window.matchMedia('(min-width: 1100px)');
  var chapterLinks = Array.from(outline.querySelectorAll('li > a'));
  var chapters = chapterLinks.map(function (link) { return byId(link.hash.slice(1)); });
  var activeChapter = -1;

  function updateOutlineLayout() {
    outline.open = wideLayout.matches;
    outlineSummary.tabIndex = wideLayout.matches ? -1 : 0;
    scheduleReadingUpdate();
  }

  function updateCurrentChapter() {
    var headerHeight = document.querySelector('.site-header').getBoundingClientRect().height;
    var threshold = headerHeight + (wideLayout.matches ? 28 : 80) + 4;
    var selected = 0;
    chapters.forEach(function (chapter, index) {
      if (chapter.getBoundingClientRect().top <= threshold) selected = index;
    });
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 5) selected = chapters.length - 1;
    if (selected === activeChapter) return;
    activeChapter = selected;
    chapterLinks.forEach(function (link, index) {
      if (index === selected) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    byId('outline-current').textContent = chapterLinks[selected].lastElementChild.textContent;
  }

  outline.addEventListener('click', function (event) {
    if (event.target.closest('summary')) {
      if (wideLayout.matches) event.preventDefault();
      return;
    }
    var link = event.target.closest('.outline-nav a');
    if (!link) return;
    if (!wideLayout.matches) outline.open = false;
    var target = byId(link.hash.slice(1));
    if (target) {
      target.setAttribute('tabindex', '-1');
      requestAnimationFrame(function () { target.focus({preventScroll: true}); });
    }
  });
  outline.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !wideLayout.matches && outline.open) {
      event.preventDefault();
      outline.open = false;
      outlineSummary.focus();
    }
  });
  document.addEventListener('click', function (event) {
    if (!wideLayout.matches && outline.open && !outline.contains(event.target)) outline.open = false;
  });
  wideLayout.addEventListener('change', updateOutlineLayout);

  var progressPending = false;
  function updateProgress() {
    var distance = document.documentElement.scrollHeight - window.innerHeight;
    byId('reading-progress').style.width = Math.min(100, Math.max(0, distance > 0 ? 100 * window.scrollY / distance : 0)) + '%';
    updateCurrentChapter();
    progressPending = false;
  }
  function scheduleReadingUpdate() {
    if (!progressPending) {
      progressPending = true;
      requestAnimationFrame(updateProgress);
    }
  }
  window.addEventListener('scroll', scheduleReadingUpdate, {passive: true});
  window.addEventListener('resize', scheduleReadingUpdate);
  window.addEventListener('load', scheduleReadingUpdate);
  if (window.ResizeObserver) new ResizeObserver(scheduleReadingUpdate).observe(document.querySelector('.article-content'));
  if (document.fonts) document.fonts.ready.then(scheduleReadingUpdate);
  updateOutlineLayout();

  function revealCitation() {
    if (window.location.hash === '#citation') byId('citation').open = true;
    scheduleReadingUpdate();
  }
  window.addEventListener('hashchange', revealCitation);
  revealCitation();

  // The demo solves one exact 2D update, not a neural-network training run.
  var chart = byId('metric-chart');
  var scene = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  scene.setAttribute('aria-hidden', 'true');
  chart.appendChild(scene);
  var lambdaInput = byId('lambda-slider');
  var angleInput = byId('angle-slider');
  var message = byId('curvature-message');
  var playButton = byId('play-demo');
  var playing = false;
  var animationFrame = null;
  var startedAt = null;
  var lastPaint = 0;
  var animationPhase = 0;

  function svgElement(tag, attributes, text) {
    var element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attributes).forEach(function (key) { element.setAttribute(key, attributes[key]); });
    if (text !== undefined) element.textContent = text;
    scene.appendChild(element);
    return element;
  }

  function niceTickStep(extent) {
    var raw = extent / 2.5;
    var power = Math.pow(10, Math.floor(Math.log10(raw)));
    var relative = raw / power;
    return (relative <= 1 ? 1 : relative <= 2 ? 2 : relative <= 5 ? 5 : 10) * power;
  }

  function drawMetric(result) {
    while (scene.firstChild) scene.removeChild(scene.firstChild);
    var cx = 325;
    var cy = 207;
    var extent = Math.max(1.65, 1.16 * Math.sqrt(result.eigenvalues[0]), 1.25 * Math.hypot(result.Hy[0], result.Hy[1]));
    var scale = 174 / extent;
    var tick = niceTickStep(extent);
    var horizontalExtent = 275 / scale;
    var i;
    for (i = -Math.floor(horizontalExtent / tick); i <= Math.floor(horizontalExtent / tick); i += 1) {
      var x = cx + i * tick * scale;
      svgElement('line', {x1: x, x2: x, y1: 29, y2: 385, 'class': i === 0 ? 'metric-axis' : 'metric-grid'});
      if (i !== 0) svgElement('text', {x: x, y: 401, 'text-anchor': 'middle', 'class': 'metric-tick'}, Number((i * tick).toPrecision(3)));
    }
    for (i = -Math.floor(extent / tick); i <= Math.floor(extent / tick); i += 1) {
      var y = cy - i * tick * scale;
      svgElement('line', {x1: 42, x2: 608, y1: y, y2: y, 'class': i === 0 ? 'metric-axis' : 'metric-grid'});
      if (i !== 0) svgElement('text', {x: 33, y: y + 4, 'text-anchor': 'end', 'class': 'metric-tick'}, Number((i * tick).toPrecision(3)));
    }
    svgElement('ellipse', {
      cx: cx, cy: cy,
      rx: scale * Math.sqrt(result.eigenvalues[0]),
      ry: scale * Math.sqrt(result.eigenvalues[1]),
      transform: 'rotate(' + (-result.eigenangle * 180 / Math.PI) + ' ' + cx + ' ' + cy + ')',
      'class': 'metric-new'
    });
    svgElement('circle', {cx: cx, cy: cy, r: scale, 'class': 'metric-old'});

    function arrow(vector, className, label, labelOffset) {
      var dx = scale * vector[0];
      var dy = -scale * vector[1];
      var length = Math.hypot(dx, dy);
      var ux = dx / length;
      var uy = dy / length;
      var ex = cx + dx;
      var ey = cy + dy;
      var tipSize = Math.min(9, length * 0.28);
      svgElement('line', {x1: cx, y1: cy, x2: ex - ux * tipSize * 0.6, y2: ey - uy * tipSize * 0.6, 'class': className, 'stroke-width': 2.7, 'stroke-dasharray': className === 'metric-y' ? '4 4' : 'none'});
      svgElement('polygon', {points: ex + ',' + ey + ' ' + (ex - ux * tipSize - uy * tipSize * 0.45) + ',' + (ey - uy * tipSize + ux * tipSize * 0.45) + ' ' + (ex - ux * tipSize + uy * tipSize * 0.45) + ',' + (ey - uy * tipSize - ux * tipSize * 0.45), 'class': className, 'stroke-width': 0});
      svgElement('text', {x: ex + (dx < -3 ? -10 : 10), y: ey + labelOffset, 'text-anchor': dx < -3 ? 'end' : 'start', 'class': 'metric-label'}, label);
    }
    arrow(result.y, 'metric-y', 'y', -13);
    arrow([1, 0], 'metric-s', 's', 22);
    arrow(result.Hy, 'metric-hy', 'Hy', -5);
    svgElement('circle', {cx: cx, cy: cy, r: 3.5, fill: 'var(--ink)'});
  }

  // SVG viewBox scaling must not shrink labels below the surrounding UI text.
  function resizeChartLabels() {
    var transform = chart.getScreenCTM();
    if (!transform || !transform.a) return;
    var base = parseFloat(getComputedStyle(document.documentElement).fontSize);
    chart.style.setProperty('--chart-label-size', (base / transform.a) + 'px');
    chart.style.setProperty('--chart-vector-size', (base * 1.125 / transform.a) + 'px');
  }
  if (window.ResizeObserver) new ResizeObserver(resizeChartLabels).observe(chart);
  else window.addEventListener('resize', resizeChartLabels);
  resizeChartLabels();

  function updateMetric() {
    var lambda = Math.pow(10, Number(lambdaInput.value));
    var angle = Number(angleInput.value);
    var result = math.softUpdate(lambda, angle);
    byId('lambda-value').textContent = Number(lambda.toPrecision(3));
    lambdaInput.setAttribute('aria-valuetext', 'lambda ' + Number(lambda.toPrecision(3)));
    byId('angle-value').textContent = Math.round(angle);
    byId('curvature-value').textContent = (Math.abs(result.curvature) < 1e-10 ? 0 : result.curvature).toFixed(3);
    byId('eigenvalue-value').textContent = result.eigenvalues[1].toFixed(3);
    byId('residual-value').textContent = result.residual.toFixed(3);
    var compatible = result.curvature > 1e-8;
    message.classList.toggle('incompatible', !compatible);
    message.textContent = compatible ? 'This pair admits a positive-definite exact secant fit.' : Math.abs(result.curvature) < 1e-8 ? 'An orthogonal pair cannot be fit exactly by a positive-definite metric.' : 'Negative curvature: no positive-definite metric can fit this pair exactly.';
    document.querySelectorAll('[data-angle]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.angle) === angle));
    });
    drawMetric(result);
  }

  function stopAnimation() {
    playing = false;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    startedAt = null;
    playButton.textContent = '▶ Animate the pair';
    playButton.setAttribute('aria-pressed', 'false');
    message.setAttribute('aria-live', 'polite');
  }

  function animate(time) {
    if (!playing) return;
    if (startedAt === null) startedAt = time;
    // Cap painting at 30 fps. There is no animation until the reader presses Play.
    if (time - lastPaint >= 32) {
      angleInput.value = Math.round(90 + 70 * Math.sin(animationPhase + (time - startedAt) * Math.PI / 6000));
      updateMetric();
      lastPaint = time;
    }
    animationFrame = requestAnimationFrame(animate);
  }
  playButton.addEventListener('click', function () {
    if (playing) { stopAnimation(); return; }
    animationPhase = Math.asin(Math.max(-1, Math.min(1, (Number(angleInput.value) - 90) / 70)));
    playing = true;
    lastPaint = 0;
    playButton.textContent = 'Ⅱ Pause animation';
    playButton.setAttribute('aria-pressed', 'true');
    message.setAttribute('aria-live', 'off');
    animationFrame = requestAnimationFrame(animate);
  });
  [lambdaInput, angleInput].forEach(function (input) {
    input.addEventListener('input', function () { stopAnimation(); updateMetric(); });
  });
  document.querySelectorAll('[data-angle]').forEach(function (button) {
    button.addEventListener('click', function () { stopAnimation(); angleInput.value = button.dataset.angle; updateMetric(); });
  });
  byId('reset-demo').addEventListener('click', function () { stopAnimation(); lambdaInput.value = 1; angleInput.value = 35; updateMetric(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopAnimation(); });
  updateMetric();

  function updateStorage() {
    var n = Math.pow(2, Number(byId('width-slider').value));
    var memory = math.memoryBytes(n);
    byId('width-slider').setAttribute('aria-valuetext', n + ' by ' + n + ' weights');
    byId('layer-dimension').textContent = n.toLocaleString('en-US') + ' × ' + n.toLocaleString('en-US');
    byId('dense-memory').textContent = math.formatBytes(memory.dense);
    byId('diag-memory').textContent = math.formatBytes(memory.diag);
    byId('kron-memory').textContent = math.formatBytes(memory.kron);
  }
  byId('width-slider').addEventListener('input', updateStorage);
  updateStorage();

  var tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  function selectTab(selected, focus) {
    tabs.forEach(function (tab) {
      var active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      byId(tab.getAttribute('aria-controls')).hidden = !active;
    });
    if (focus) selected.focus();
    updateProgress();
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { selectTab(tab, false); });
    tab.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[next], true);
    });
  });

  var dialog = byId('figure-dialog');
  var opener = null;
  document.querySelectorAll('[data-figure]').forEach(function (button) {
    button.addEventListener('click', function () {
      opener = button;
      byId('dialog-image').src = button.dataset.figure;
      byId('dialog-image').alt = button.querySelector('img').alt;
      dialog.showModal();
      dialog.scrollLeft = 0;
      dialog.scrollTop = 0;
      document.body.style.overflow = 'hidden';
      byId('close-figure').focus();
    });
  });
  byId('close-figure').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) {
    if (event.target !== dialog) return;
    var bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', function () { document.body.style.overflow = ''; if (opener) opener.focus(); });

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var code = byId(button.dataset.copy);
      function reportCopied() {
        button.textContent = 'Copied';
        byId('copy-status').textContent = 'Copied to clipboard.';
        setTimeout(function () { button.textContent = 'Copy'; }, 1800);
      }
      function selectForCopy() {
        var range = document.createRange();
        range.selectNodeContents(code);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        var copied = false;
        try { copied = document.execCommand('copy'); } catch (_) {}
        if (copied) { selection.removeAllRanges(); reportCopied(); }
        else byId('copy-status').textContent = 'Text selected. Press Control+C or Command+C to copy.';
      }
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(code.textContent).then(reportCopied, selectForCopy);
      else selectForCopy();
    });
  });
  updateProgress();
}());
