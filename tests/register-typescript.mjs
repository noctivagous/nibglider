// Use the project's existing TypeScript compiler with Node's test runner.
// This scoped hook avoids a new test dependency or generated source files.
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourceRoot = new URL('../src/', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    // Mirrors Vite's ?raw import: the file resolves normally, the suffix
    // rides along so load() can serve its text as the default export.
    if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && specifier.endsWith('?raw')) {
      const file = new URL(specifier.slice(0, -'?raw'.length), context.parentURL);
      return { url: `${file.href}?raw`, shortCircuit: true };
    }
    if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && !specifier.endsWith('.ts')) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(sourceRoot) && url.endsWith('?raw')) {
      const text = readFileSync(fileURLToPath(new URL(url.slice(0, -'?raw'.length))), 'utf8');
      return { format: 'module', source: `export default ${JSON.stringify(text)};`, shortCircuit: true };
    }
    if (url.startsWith(sourceRoot) && url.endsWith('.ts')) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      const result = ts.transpileModule(source, { compilerOptions: {
        target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: true,
      } });
      return { format: 'module', source: result.outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
