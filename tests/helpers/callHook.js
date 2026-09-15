import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Runs a hook once and hands back what it returned.
 *
 * `useBudgetSelectors` is built from `useMemo`/`useCallback` only — no effects,
 * no state — so a single server render is enough to exercise it, and that keeps
 * the suite free of jsdom and a DOM testing library.
 */
export function callHook(useHook, props) {
  let captured;
  function Probe() {
    captured = useHook(props);
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  return captured;
}
