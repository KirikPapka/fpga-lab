/* fpga-lab: page shell, controls, keyboard, and SimView (the shared viewer
 * for lessons that step a simulation: waveform, block strip, Verilog, values).
 */
(function (LAB) {
  'use strict';

  LAB.lessons = LAB.lessons || [];
  // Settings shared across lessons, so the bus width chosen in lesson 1 carries on.
  LAB.state = { width: 8, threshold: 3, armed: 1, speed: 8 };

  // ---------------------------------------------------------------- DOM helpers
  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }

  // Mouse clicks shouldn't leave focus on a button, or space would press it again.
  const noStickyFocus = (b) => b.addEventListener('mouseup', () => b.blur());

  function button(label, onClick, opts = {}) {
    const b = el('button', { class: 'btn' + (opts.primary ? ' primary' : ''), type: 'button', title: opts.title },
      label, opts.key ? el('span', { class: 'key' }, opts.key) : null);
    b.addEventListener('click', onClick);
    noStickyFocus(b);
    return b;
  }

  function toggle(label, value, onChange) {
    const b = el('button', { class: 'tog', type: 'button' });
    const render = () => {
      b.textContent = '';
      b.append(el('span', { class: 'box' }, value ? '[x]' : '[ ]'), ' ' + label);
      b.setAttribute('aria-pressed', String(!!value));
    };
    b.addEventListener('click', () => {
      value = !value;
      render();
      onChange(value);
    });
    noStickyFocus(b);
    render();
    b.set = (v) => {
      value = v;
      render();
    };
    return b;
  }

  function choice(label, options, value, onChange) {
    const seg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
    const btns = options.map((o) => {
      const b = el('button', { type: 'button', role: 'radio', title: o.title }, o.label);
      b.addEventListener('click', () => {
        value = o.value;
        sync();
        onChange(value);
      });
      noStickyFocus(b);
      return b;
    });
    const sync = () => btns.forEach((b, k) => b.setAttribute('aria-checked', String(options[k].value === value)));
    sync();
    seg.append(...btns);
    return el('div', { class: 'ctl' }, el('span', { class: 'lab' }, label), seg);
  }

  function slider(label, { min, max, step, value, fmt }, onChange) {
    const out = el('span', { class: 'val' }, fmt(value));
    const input = el('input', { type: 'range', min, max, step, value, 'aria-label': label });
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = fmt(v);
      onChange(v);
    });
    const wrap = el('div', { class: 'ctl slider' }, el('span', { class: 'lab' }, label), input, out);
    wrap.set = (v) => {
      input.value = v;
      out.textContent = fmt(v);
    };
    return wrap;
  }

  const row = (...kids) => el('div', { class: 'row' }, ...kids);
  const note = (html) => el('div', { class: 'note', html });

  LAB.UI = { el, button, toggle, choice, slider, row, note };

  // Status bar: segments separated by thin rules. Parts may contain trusted HTML.
  LAB.statusLine = (parts) => parts.filter(Boolean).map((p) => `<span>${p}</span>`).join('<span class="sep">│</span>');

  // ---------------------------------------------------------------- SimView
  class SimView {
    // cfg: design(), inputs(cycle, view), signals(), strip[], codeTags[], codeDefault,
    //      values(snap, prev, view), status(snap, view), onReset(view), afterStep(snap, view)
    constructor(ctx, cfg) {
      this.ctx = ctx;
      this.cfg = cfg;
      this.running = false;
      this.canvas = el('canvas', { class: 'wave', role: 'img', 'aria-label': 'Waveform: signal values over clock cycles. Click a cycle to inspect it.' });
      ctx.stage.append(this.canvas);
      this.canvas.addEventListener('click', (e) => {
        const c = LAB.Wave.cycleAt(this.canvas, this.waveView(), e.clientX);
        if (c !== null && c >= 0 && c < this.sim.history.length) {
          this.stop();
          this.cursor = c;
          this.render();
        }
      });
      this.tabs = el('div', { class: 'tabs', role: 'tablist' });
      this.body = el('div', { class: 'code-body' });
      ctx.code.append(this.tabs, this.body);
      this.codeKey = cfg.codeDefault;
      this.ro = new ResizeObserver(() => this.render());
      this.ro.observe(ctx.stage);
      this.reset();
    }

    reset() {
      this.stop();
      this.sim = new LAB.Sim(this.cfg.design());
      if (this.cfg.onReset) this.cfg.onReset(this);
      this.start = 0;
      this.cursor = -1;
      this.simulate(); // cycle 0: reset
      this.buildTabs();
      this.render();
    }

    simulate() {
      const c = this.sim.cycle;
      const snap = this.sim.step(this.cfg.inputs(c, this));
      if (this.cfg.afterStep) this.cfg.afterStep(snap, this);
      this.cursor = c;
    }

    get last() {
      return this.sim.history.length - 1;
    }

    step() {
      this.stop();
      if (this.cursor < this.last) this.cursor++;
      else this.simulate();
      this.follow();
      this.render();
    }

    scrub(d) {
      this.stop();
      this.cursor = Math.max(0, Math.min(this.last, this.cursor + d));
      this.follow();
      this.render();
    }

    toggleRun() {
      if (this.running) this.stop();
      else this.run();
    }

    run() {
      if (this.running) return;
      this.running = true;
      this.cursor = this.last;
      let lastT = performance.now();
      let acc = 0;
      const tick = (now) => {
        if (!this.running) return;
        acc += ((now - lastT) / 1000) * LAB.state.speed;
        lastT = now;
        let k = Math.min(64, Math.floor(acc));
        acc -= Math.floor(acc);
        if (k > 0) {
          while (k--) this.simulate();
          this.follow();
          this.render();
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
      this.syncRun();
    }

    stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.syncRun();
    }

    destroy() {
      this.stop();
      this.ro.disconnect();
    }

    syncRun() {
      if (this.runBtn) this.runBtn.firstChild.textContent = this.running ? 'pause' : 'run';
    }

    // Step / run / reset buttons and the speed slider.
    basicControls() {
      this.runBtn = button('run', () => this.toggleRun(), { key: 'r' });
      const speeds = [1, 2, 4, 8, 16, 32, 64];
      const k0 = Math.max(0, speeds.indexOf(LAB.state.speed));
      return el('div', { class: 'stack' },
        row(button('step', () => this.step(), { key: 'space', primary: true }), this.runBtn, button('reset', () => this.reset())),
        slider('speed', { min: 0, max: speeds.length - 1, step: 1, value: k0, fmt: (k) => speeds[k] + ' cycles/s' }, (k) => {
          LAB.state.speed = speeds[k];
        })
      );
    }

    waveView() {
      return { history: this.sim.history, cursor: this.cursor, start: this.start, signals: this.cfg.signals(), cellW: this.cfg.cellW };
    }

    follow() {
      const n = LAB.Wave.cellsFor(this.canvas.clientWidth || 600, this.cfg.cellW);
      if (this.cursor < this.start) this.start = this.cursor;
      if (this.cursor >= this.start + n) this.start = this.cursor - n + 1;
      this.start = Math.max(0, this.start);
    }

    modules() {
      const tags = this.cfg.codeTags;
      return this.sim.design.verilog.filter((v) => tags.includes(v.tags));
    }

    buildTabs() {
      const mods = this.modules();
      if (!mods.some((m) => m.tags === this.codeKey)) this.codeKey = mods[0].tags;
      this.tabs.innerHTML = '';
      mods.forEach((m) => {
        const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(m.tags === this.codeKey) }, m.name + '.v');
        b.addEventListener('click', () => this.showCode(m.tags));
        noStickyFocus(b);
        this.tabs.append(b);
      });
    }

    showCode(key) {
      this.codeKey = key;
      this.buildTabs();
      this.render();
    }

    render() {
      const snap = this.sim.history[this.cursor];
      const prev = this.sim.history[this.cursor - 1];
      if (!snap) return;
      LAB.Wave.draw(this.canvas, this.waveView());
      this.renderStrip(snap);
      this.renderCode(snap);
      this.ctx.values.innerHTML = this.cfg.values ? this.cfg.values(snap, prev, this) : '';
      this.ctx.status.innerHTML = this.cfg.status ? this.cfg.status(snap, this) : '';
    }

    renderStrip(snap) {
      const strip = this.ctx.strip;
      strip.innerHTML = '';
      (this.cfg.strip || []).forEach((it, k) => {
        if (k) strip.append(el('span', { class: 'arrow', 'aria-hidden': 'true' }, it.gap ? ' ' : '─▶'));
        const cls = ['node'];
        if (it.faint) cls.push('faint');
        if (it.active && it.active(snap)) cls.push('on');
        if (it.code && it.code === this.codeKey) cls.push('sel');
        const node = el(it.code ? 'button' : 'div', { class: cls.join(' '), type: it.code ? 'button' : undefined, title: it.code ? 'show Verilog' : undefined },
          el('span', { class: 'nl' }, it.label),
          el('span', { class: 'ns' }, it.sub ? it.sub(snap) : ''));
        if (it.code) {
          node.addEventListener('click', () => this.showCode(it.code));
          noStickyFocus(node);
        }
        strip.append(node);
      });
    }

    renderCode(snap) {
      const mod = this.modules().find((m) => m.tags === this.codeKey);
      if (!mod) return;
      const first = LAB.Verilog.render(this.body, mod.name, (snap._tags || {})[mod.tags]);
      if (first >= 0) {
        const ln = this.body.children[first];
        const top = ln.offsetTop;
        const b = this.body;
        if (top < b.scrollTop || top + ln.offsetHeight > b.scrollTop + b.clientHeight) {
          b.scrollTop = Math.max(0, top - b.clientHeight / 3);
        }
      }
    }
  }
  LAB.SimView = SimView;

  // ---------------------------------------------------------------- app shell
  const App = {
    idx: -1,
    lesson: null,

    start() {
      const $ = (id) => document.getElementById(id);
      this.dom = {
        root: $('app'), select: $('lesson'), title: $('title'), about: $('about'), controls: $('controls'),
        tryList: $('try'), simplified: $('simplified'), stage: $('stage'), strip: $('strip'),
        code: $('code'), values: $('values'), status: $('status'),
      };
      const d = this.dom;
      LAB.lessons.forEach((l, k) => d.select.append(el('option', { value: k }, `${k}  ${l.title}`)));
      d.select.addEventListener('change', () => this.show(Number(d.select.value)));
      $('prev').addEventListener('click', () => this.show(this.idx - 1));
      $('next').addEventListener('click', () => this.show(this.idx + 1));
      [$('prev'), $('next')].forEach(noStickyFocus);
      document.addEventListener('keydown', (e) => this.key(e));
      window.addEventListener('hashchange', () => {
        const k = parseInt(location.hash.slice(1), 10);
        if (k !== this.idx && LAB.lessons[k]) this.show(k);
      });
      const k = parseInt(location.hash.slice(1), 10);
      this.show(LAB.lessons[k] ? k : 0);
    },

    show(k) {
      if (!LAB.lessons[k] || k === this.idx) return;
      const old = this.lesson;
      if (old) {
        if (old.view) old.view.destroy();
        if (old.unmount) old.unmount();
        old.view = null;
      }
      const d = this.dom;
      for (const key of ['stage', 'strip', 'code', 'values', 'status', 'controls']) {
        d[key].innerHTML = '';
        d[key].scrollTop = 0;
      }
      this.idx = k;
      const l = (this.lesson = LAB.lessons[k]);
      d.root.dataset.kind = l.kind || 'sim';
      d.select.value = String(k);
      d.title.textContent = `${k} · ${l.title}`;
      d.about.innerHTML = l.about;
      d.tryList.innerHTML = l.tryThis.map((t) => `<li>${t}</li>`).join('');
      d.simplified.innerHTML = l.simplified;
      document.getElementById('prev').disabled = k === 0;
      document.getElementById('next').disabled = k === LAB.lessons.length - 1;
      if (location.hash !== '#' + k) {
        // Some browsers refuse history changes on file:// pages; the hash is only a convenience.
        try {
          history.replaceState(null, '', '#' + k);
        } catch (e) {
          /* keep going without it */
        }
      }
      l.mount({ stage: d.stage, strip: d.strip, code: d.code, values: d.values, status: d.status, controls: d.controls });
    },

    key(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'select' || tag === 'textarea';
      if (typing) return;
      const l = this.lesson;
      const v = l && l.view;
      if (/^[1-9]$/.test(e.key)) {
        const k = Number(e.key) - 1;
        if (LAB.lessons[k]) {
          e.preventDefault();
          this.show(k);
        }
        return;
      }
      if (l && l.key && l.key(e)) {
        e.preventDefault();
        return;
      }
      if (!v) return;
      if (e.key === ' ' && tag !== 'button') {
        e.preventDefault();
        v.step();
      } else if (e.key === 'r') {
        v.toggleRun();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        v.scrub(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        v.scrub(1);
      } else if (e.key === 'Escape') {
        v.stop();
      }
    },
  };
  LAB.App = App;

  document.addEventListener('DOMContentLoaded', () => App.start());
})((globalThis.LAB = globalThis.LAB || {}));
