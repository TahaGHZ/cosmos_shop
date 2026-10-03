import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// The local demo keeps its portable JSON format. Write a complete replacement
// beside the target, then rename it so a crash cannot leave shop.json truncated.
export function readJsonFile(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : fallback;
}

export function writeJsonFileAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(value, null, 2));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.rmSync(tempPath, { force: true }); } catch {}
    throw error;
  }
}
