/**
 * BudouX base parser, ported from budoux@0.10.2 (module/parser.js).
 * Copyright 2021 Google LLC, licensed under the Apache License, Version 2.0:
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Only the segmentation path is kept. The package's HTML helpers depend on linkedom,
 * which does not bundle, so the Japanese model is vendored alongside this parser.
 */

type ModelGroup = Map<string, number>;

/**
 * Feature templates: each reads the model group `name` at the substring between
 * `from` and `to` characters around a candidate boundary.
 */
const FEATURES: ReadonlyArray<readonly [name: string, from: number, to: number]> = [
  ['UW1', -3, -2],
  ['UW2', -2, -1],
  ['UW3', -1, 0],
  ['UW4', 0, 1],
  ['UW5', 1, 2],
  ['UW6', 2, 3],
  ['BW1', -2, 0],
  ['BW2', -1, 1],
  ['BW3', 0, 2],
  ['TW1', -3, 0],
  ['TW2', -2, 1],
  ['TW3', -1, 2],
  ['TW4', 0, 3],
];

export class Parser {
  private readonly features: ReadonlyArray<readonly [ModelGroup | undefined, number, number]>;
  private readonly baseScore: number;

  constructor(model: Record<string, Record<string, number>>) {
    const groups = new Map(
      Object.entries(model).map(([name, weights]): [string, ModelGroup] => [
        name,
        new Map(Object.entries(weights)),
      ]),
    );
    this.features = FEATURES.map(([name, from, to]) => [groups.get(name), from, to] as const);
    let total = 0;
    for (const group of groups.values()) {
      for (const weight of group.values()) total += weight;
    }
    // Scores are shifted by half the total weight so that a boundary needs a net positive score.
    this.baseScore = -0.5 * total;
  }

  /** Splits a sentence into phrases. Joining the result gives back the input. */
  parse(sentence: string): string[] {
    if (sentence === '') return [];
    const result: string[] = [];
    let start = 0;
    for (const boundary of this.parseBoundaries(sentence)) {
      result.push(sentence.slice(start, boundary));
      start = boundary;
    }
    result.push(sentence.slice(start));
    return result;
  }

  /** Character offsets where a new phrase starts. */
  private parseBoundaries(sentence: string): number[] {
    const boundaries: number[] = [];
    for (let i = 1; i < sentence.length; i++) {
      // Never separate the two halves of a surrogate pair.
      if ((sentence.codePointAt(i - 1) ?? 0) > 0xffff) continue;
      let score = this.baseScore;
      for (const [group, from, to] of this.features) {
        score += group?.get(sentence.substring(i + from, i + to)) ?? 0;
      }
      if (score > 0) boundaries.push(i);
    }
    return boundaries;
  }
}
