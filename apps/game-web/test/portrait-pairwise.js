export function buildPairwisePortraitSpecs(baseSpec, enums) {
  const factors = enumFactors(enums);
  const required = allRequiredPairs(factors);
  const candidates = candidateAssignments(factors).map((assignment) => ({
    assignment,
    coverage: coveredPairs(assignment, factors)
  }));
  const uncovered = new Set(required);
  const selected = [];
  const scores = candidates.map(({ coverage }) => coverage.length);
  const candidatesByPair = new Map();
  for (const [index, { coverage }] of candidates.entries()) {
    for (const key of coverage) {
      const indexes = candidatesByPair.get(key) ?? [];
      indexes.push(index);
      candidatesByPair.set(key, indexes);
    }
  }

  while (uncovered.size) {
    let bestIndex = -1;
    for (let index = 0; index < scores.length; index += 1) {
      if (bestIndex < 0 || scores[index] > scores[bestIndex]) bestIndex = index;
    }
    if (bestIndex < 0 || scores[bestIndex] < 1) {
      throw new Error(`Pairwise generation left ${uncovered.size} pairs.`);
    }
    const best = candidates[bestIndex];
    selected.push(best.assignment);
    scores[bestIndex] = -1;
    for (const key of best.coverage) {
      if (!uncovered.delete(key)) continue;
      for (const candidateIndex of candidatesByPair.get(key) ?? []) {
        if (scores[candidateIndex] > 0) scores[candidateIndex] -= 1;
      }
    }
  }

  return Object.freeze(selected.map((assignment) => (
    assignmentToSpec(baseSpec, factors, assignment)
  )));
}

export function uncoveredPortraitPairs(specs, enums) {
  const factors = enumFactors(enums);
  const covered = new Set();
  for (const spec of specs) {
    const assignment = factors.map(({ path }) => readPath(spec, path));
    for (const key of coveredPairs(assignment, factors)) covered.add(key);
  }
  return allRequiredPairs(factors).filter((key) => !covered.has(key));
}

function enumFactors(enums) {
  const factors = [];
  for (const [group, fields] of Object.entries(enums)) {
    if (group === 'background') {
      factors.push({ path: ['background'], values: fields });
      continue;
    }
    for (const [field, values] of Object.entries(fields)) {
      factors.push({ path: [group, field], values });
    }
  }
  return factors;
}

function allRequiredPairs(factors) {
  const pairs = [];
  for (let left = 0; left < factors.length; left += 1) {
    for (let right = left + 1; right < factors.length; right += 1) {
      for (const leftValue of factors[left].values) {
        for (const rightValue of factors[right].values) {
          pairs.push(pairKey(left, leftValue, right, rightValue));
        }
      }
    }
  }
  return pairs;
}

function candidateAssignments(factors) {
  const candidates = new Map();
  let sequence = 0;
  for (let left = 0; left < factors.length; left += 1) {
    for (let right = left + 1; right < factors.length; right += 1) {
      for (const leftValue of factors[left].values) {
        for (const rightValue of factors[right].values) {
          const assignment = factors.map(({ values }, index) => (
            values[(sequence * (index + 3) + index * 11) % values.length]
          ));
          assignment[left] = leftValue;
          assignment[right] = rightValue;
          candidates.set(JSON.stringify(assignment), assignment);
          sequence += 1;
        }
      }
    }
  }
  return [...candidates.values()];
}

function coveredPairs(assignment, factors) {
  const pairs = [];
  for (let left = 0; left < factors.length; left += 1) {
    for (let right = left + 1; right < factors.length; right += 1) {
      pairs.push(pairKey(
        left,
        assignment[left],
        right,
        assignment[right]
      ));
    }
  }
  return pairs;
}

function pairKey(left, leftValue, right, rightValue) {
  return JSON.stringify([left, leftValue, right, rightValue]);
}

function assignmentToSpec(baseSpec, factors, assignment) {
  const spec = structuredClone(baseSpec);
  for (const [index, { path }] of factors.entries()) {
    writePath(spec, path, assignment[index]);
  }
  return spec;
}

function readPath(value, path) {
  return path.reduce((current, part) => current[part], value);
}

function writePath(value, path, selected) {
  if (path.length === 1) value[path[0]] = selected;
  else value[path[0]][path[1]] = selected;
}
