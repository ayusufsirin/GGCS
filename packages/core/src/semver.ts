interface Version {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

function parseVersion(input: string): Version | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(input.trim());
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compare(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function caretUpper(version: Version): Version {
  if (version.major > 0) return { major: version.major + 1, minor: 0, patch: 0 };
  if (version.minor > 0) return { major: 0, minor: version.minor + 1, patch: 0 };
  return { major: 0, minor: 0, patch: version.patch + 1 };
}

export function satisfiesVersion(versionInput: string, rangeInput: string): boolean {
  const version = parseVersion(versionInput);
  if (!version) return false;
  const range = rangeInput.trim();
  if (range === "*" || range === "") return true;

  if (range.startsWith("^")) {
    const lower = parseVersion(range.slice(1));
    if (!lower) return false;
    return compare(version, lower) >= 0 && compare(version, caretUpper(lower)) < 0;
  }

  const exact = parseVersion(range);
  if (exact) return compare(version, exact) === 0;

  const clauses = range.split(/\s+/).filter(Boolean);
  if (clauses.length === 0) return false;
  return clauses.every((clause) => {
    const match = /^(>=|<=|>|<)(\d+\.\d+\.\d+)$/.exec(clause);
    if (!match) return false;
    const target = parseVersion(match[2]!);
    if (!target) return false;
    const c = compare(version, target);
    switch (match[1]) {
      case ">=":
        return c >= 0;
      case "<=":
        return c <= 0;
      case ">":
        return c > 0;
      case "<":
        return c < 0;
      default:
        return false;
    }
  });
}
