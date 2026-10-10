// Probe the actual trainer engine; no table of equivalent key names.
export function createMissionEngine(createCalculator, data, route, keys) {
  function replay(history) {
    let rendered = null;
    const renderer = Object.fromEntries(['Home', 'Menu', 'Wizard', 'Result', 'Editor', 'Graph']
      .map(name => ['render' + name, value => { rendered = value; }]));
    renderer.clear = () => { rendered = null; };
    const calculator = createCalculator(null, { renderer });
    if (Array.isArray(data)) calculator.setList('L1', data);
    else {
      for (const [name, values] of Object.entries(data.lists || {})) calculator.setList(name, values);
      for (const [name, values] of Object.entries(data.matrices || {})) calculator.setMatrix(name, values);
      // A fixture-backed problem carries the ZoomStat histogram window a real TI-84 showed.
      if (data.histogramWindow) calculator.setHistogramWindow(data.histogramWindow);
    }
    for (const key of history) calculator.pressKey(key);
    return { calculator, fingerprint() {
      const snapshot = calculator.save();
      // Milestones describe the task's visible state, not unrelated stored lists.
      // Results still have to match the calculation for the supplied dataset.
      // Dormant results must not prevent navigating back through a menu/wizard.
      return JSON.stringify({
        screen: snapshot.screen, rendered,
        values: calculator.getWizardValues(),
        computed: ['result', 'home'].includes(snapshot.screen.type) ? calculator.getComputedValues() : null,
        stored: Array.isArray(data) ? null : { lists: snapshot.lists, matrices: snapshot.matrices, plot: snapshot.plotSettings },
        second: snapshot.secondActive, alpha: snapshot.alphaActive,
      });
    } };
  }
  const targets = route.map((_, i) => replay(route.slice(0, i + 1)).fingerprint());
  let cachedHistory = null, cachedTransitions = null;
  return {
    transitions(state) {
      if (state.step >= route.length) return {};
      const signature = JSON.stringify([state.step, state.keys]);
      if (signature === cachedHistory) return cachedTransitions;
      const transitions = {};
      for (const key of keys) {
        const candidate = replay(state.keys);
        const before = candidate.fingerprint();
        candidate.calculator.pressKey(key);
        const result = candidate.fingerprint();
        if (result === before) continue;
        // Digit shortcuts and other genuine forward shortcuts may skip a checkpoint.
        const target = targets.findIndex((value, i) => i >= state.step && value === result);
        if (target !== -1) transitions[key] = target + 1;
      }
      cachedHistory = signature; cachedTransitions = transitions;
      return transitions;
    },
  };
}
