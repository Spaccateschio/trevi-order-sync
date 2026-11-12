import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { shallowPropsEqual } from "./stable-props";

describe("shallowPropsEqual", () => {
  const f = () => undefined;
  it("uguali con stessi valori e stesse funzioni", () => {
    expect(shallowPropsEqual({ a: 1, f, el: createElement("input", { value: "2", onChange: f }) }, { a: 1, f, el: createElement("input", { value: "2", onChange: f }) })).toBe(true);
  });
  it("diversi se cambia il valore del campo della card", () => {
    expect(shallowPropsEqual({ el: createElement("input", { value: "2" }) }, { el: createElement("input", { value: "3" }) })).toBe(false);
  });
  it("diversi se cambia una funzione non stabile", () => {
    expect(shallowPropsEqual({ f }, { f: () => undefined })).toBe(false);
  });
});
