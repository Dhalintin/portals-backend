const fs = require('node:fs');
const path = require('node:path');

const retiredDirectories = [
  'features/pins', 'features/academic-sessions', 'features/settings',
  'features/platform-admin', 'features/public/results', 'features/public/schools',
  'utils/auth',
];
const retiredModules = [
  'features/public/dto', 'common/middleware/authenticate', 'common/middleware/authorizeGlobal',
  'common/middleware/validate', 'middlewares/auth.middleware', 'middlewares/requireRoles.middleware',
  'middlewares/requireOrgAccess', 'middlewares/validate.middleware',
  'features/classes/classSubject.controller', 'features/classes/classSubject.dto', 'features/classes/classSubject.service',
  'lib/jwt', 'utils/jwt', 'utils/issueToken', 'utils/toPublic',
  'features/student.controller', 'features/student.dto', 'features/student.routes', 'features/student.service', 'features/student.types',
  'features/academic-session/academic-sessions.dto',
  'features/classes/class.controller', 'features/classes/class.dto', 'features/classes/class.routes', 'features/classes/class.service', 'features/classes/class.types',
  'features/school/school.dto', 'features/schools/schoo.service', 'features/schools/school.controller', 'features/schools/school',
  'features/schools/school.route', 'features/schools/school.routes', 'features/schools/school.service',
  'features/students/student.controller', 'features/students/student.service',
  'features/subjects/subject.controller', 'features/subjects/subject.routes', 'features/subjects/subject.service',
  'utils/jwt-token', 'utils/toClassPublic', 'utils/toPublicUser',
];
const workspace = path.resolve(__dirname, '..');
const sourceRoot = path.join(workspace, 'src');
const archiveRoot = path.join(workspace, 'archive', 'legacy-backend');
const slash = value => value.split(path.sep).join('/');
function isRetired(relative) {
  const stem = slash(relative).replace(/(?:\.d)?\.(?:ts|js)(?:\.map)?$/, '').toLowerCase();
  return retiredModules.some(module => module.toLowerCase() === stem) || retiredDirectories.some(directory => stem === directory.toLowerCase() || stem.startsWith(directory.toLowerCase() + '/'));
}
function files(root) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const item = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing linked path: ${item}`);
    if (entry.isDirectory()) found.push(...files(item));
    else if (entry.isFile()) found.push(item);
  }
  return found;
}
function importReferences(text) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)].map(match => match[1]);
}
function auditSources() {
  const problems = [];
  for (const root of [sourceRoot, path.join(workspace, 'dist'), path.join(workspace, '.test-build')]) {
    for (const file of files(root).filter(file => /\.(?:ts|js)$/.test(file))) {
      if (isRetired(path.relative(root, file))) continue;
      for (const reference of importReferences(fs.readFileSync(file, 'utf8'))) {
        if (!reference.startsWith('.')) continue;
        const target = path.resolve(path.dirname(file), reference);
        if (isRetired(path.relative(root, target)) || target.toLowerCase() === archiveRoot.toLowerCase() || target.toLowerCase().startsWith(archiveRoot.toLowerCase() + path.sep)) {
          problems.push(`${slash(path.relative(workspace, file))} imports retired code: ${reference}`);
        }
      }
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
}
function cleanRetiredOutput() {
  // Delete only named retired module artifacts, never the whole output folder.
  for (const directory of ['dist', '.test-build']) {
    const root = path.join(workspace, directory);
    if (!fs.existsSync(root)) continue;
    const realRoot = fs.realpathSync(root);
    if (realRoot.toLowerCase() !== path.resolve(root).toLowerCase()) throw new Error('Refusing redirected output folder');
    for (const file of files(root)) {
      if (!isRetired(path.relative(root, file))) continue;
      const resolved = fs.realpathSync(file);
      if (!resolved.toLowerCase().startsWith(realRoot.toLowerCase() + path.sep)) throw new Error('Output path escaped its folder');
      if (!/\.(?:js|ts)(?:\.map)?$/.test(file)) throw new Error('Unexpected retired output file');
      fs.unlinkSync(resolved);
    }
  }
}
function checkRetirement() {
  auditSources();
  for (const directory of ['src', 'dist', '.test-build']) {
    const root = path.join(workspace, directory);
    const remaining = files(root).filter(file => isRetired(path.relative(root, file)));
    if (remaining.length) throw new Error(`Retired modules remain in ${directory}: ${remaining.map(file => slash(path.relative(root, file))).join(', ')}`);
  }
}
module.exports = { retiredDirectories, retiredModules, isRetired, importReferences, auditSources, cleanRetiredOutput, checkRetirement };
if (require.main === module && process.argv.includes('--manifest')) {
  console.log(JSON.stringify({ retiredDirectories, retiredModules }));
} else if (require.main === module) {
  try {
    auditSources();
    if (process.argv.includes('--clean')) cleanRetiredOutput();
    if (!process.argv.includes('--audit')) checkRetirement();
    console.log('[legacy] Retired module checks passed.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
