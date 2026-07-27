const bunTestModule = "bun:test";
const solidRuntimeModule = "solid-js/dist/solid.js";
const [{ mock }, solidRuntime] = await Promise.all([
  import(bunTestModule),
  import(solidRuntimeModule),
]);

mock.module("solid-js", () => solidRuntime);
