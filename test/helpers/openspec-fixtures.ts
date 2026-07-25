import { readFileSync } from "node:fs";

export interface OpenSpecFixtureRoot {
  readonly path: string;
  readonly source: string;
}

export interface OpenSpecListChangeFixture {
  readonly name: string;
  readonly completedTasks: number;
  readonly totalTasks: number;
  readonly lastModified: string;
  readonly status: string;
}

export interface OpenSpecListFixture {
  readonly changes: readonly OpenSpecListChangeFixture[];
  readonly root: OpenSpecFixtureRoot;
}

export interface OpenSpecPlanningHomeFixture {
  readonly root: string;
  readonly changesDir: string;
}

export interface OpenSpecTaskArtifactFixture {
  readonly resolvedOutputPath: string;
}

export interface OpenSpecStatusFixture {
  readonly changeName: string;
  readonly planningHome: OpenSpecPlanningHomeFixture;
  readonly changeRoot: string;
  readonly artifactPaths: {
    readonly tasks: OpenSpecTaskArtifactFixture;
  };
}

interface OpenSpecFixtureMap {
  readonly "openspec-list.json": OpenSpecListFixture;
  readonly "openspec-status.json": OpenSpecStatusFixture;
}

export function loadOpenSpecFixture<Name extends keyof OpenSpecFixtureMap>(
  fileName: Name,
): OpenSpecFixtureMap[Name] {
  const fixtureUrl = new URL(`../fixtures/${fileName}`, import.meta.url);
  return JSON.parse(
    readFileSync(fixtureUrl, "utf8"),
  ) as OpenSpecFixtureMap[Name];
}
