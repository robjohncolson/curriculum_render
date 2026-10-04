// Probe the actual trainer engine; no table of equivalent key names.
export function createMissionEngine(createCalculator, data, route, keys) {
  function replay(history) {
    let rendered = null;
    const renderer = Object.fromEntries(['Home', 'Menu', 'Wizard', 'Result', 'Editor', 'Graph']
      .map(name => ['render' + name, value => { rendered = value; }]));
    renderer.clear = () => { rendered = null; };
    const calculator = createCalculator(null, { renderer });
    calculator.setList('L1', data);
    for (const key of history) calculator.pressKey(key);
    return { calculator, fingerprint: () => JSON.stringify({
      screen: calculator.save().screen, rendered,
      values: calculator.getWizardValues(), computed: calculator.getComputedValues(),
      lists: calculator.save().lists, second: calculator.save().secondActive,
    }) };
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
        candidate.calculator.pressKey(key);
        const result = candidate.fingerprint();
        // Digit shortcuts and other genuine forward shortcuts may skip a checkpoint.
        const target = targets.findIndex((value, i) => i >= state.step && value === result);
        if (target !== -1) transitions[key] = target + 1;
      }
      cachedHistory = signature; cachedTransitions = transitions;
      return transitions;
    },
  };
}
