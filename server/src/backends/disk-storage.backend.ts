import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, opendir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ServeOptions, ServeStrategy, StorageBackend } from 'src/interfaces/storage-backend.interface';

/**
 * Recursively sums the size of every file below `folder`. A folder that does not exist (or that
 * disappears mid-walk) contributes only what was counted before it went missing, never an error.
 * Shared with `StorageRepository.getFolderSize`.
 */
export async function getFolderSize(folder: string): Promise<number> {
  let total = 0;

  try {
    const dir = await opendir(folder, { recursive: true });
    for await (const entry of dir) {
      if (entry.isFile()) {
        const entryStat = await stat(join(entry.parentPath, entry.name));
        total += entryStat.size;
      }
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return total;
}

export class DiskStorageBackend implements StorageBackend {
  constructor(private mediaLocation: string) {}

  private resolvePath(key: string): string {
    // Absolute paths are legacy disk assets — return as-is
    if (isAbsolute(key)) {
      return key;
    }
    return join(this.mediaLocation, key);
  }

  async put(key: string, source: Readable | Buffer): Promise<void> {
    const fullPath = this.resolvePath(key);
    await mkdir(dirname(fullPath), { recursive: true });

    if (Buffer.isBuffer(source)) {
      await writeFile(fullPath, source);
    } else {
      const writeStream = createWriteStream(fullPath);
      await pipeline(source, writeStream);
    }
  }

  async get(key: string): Promise<{ stream: Readable; contentType?: string; length?: number }> {
    const fullPath = this.resolvePath(key);
    const fileStat = await stat(fullPath);
    return {
      stream: createReadStream(fullPath),
      length: fileStat.size,
    };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolvePath(key));
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(this.resolvePath(prefix), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  getPrefixUsage(prefix: string): Promise<number> {
    return getFolderSize(this.resolvePath(prefix));
  }

  getServeStrategy(key: string, _options: ServeOptions): Promise<ServeStrategy> {
    return Promise.resolve({ type: 'file', path: this.resolvePath(key) });
  }

  downloadToTemp(key: string): Promise<{ tempPath: string; cleanup: () => Promise<void> }> {
    return Promise.resolve({
      tempPath: this.resolvePath(key),
      cleanup: () => Promise.resolve(),
    });
  }
}
