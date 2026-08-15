import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface PushFileTransformOptions {
  repoUrl: string;
  /** Branch to commit on, for example deploy/fraud-detector. */
  branch: string;
  /** Branch the deployment branch is based on when it does not exist yet. */
  targetBranch: string;
  /** Repository-relative path of the file to update. */
  filePath: string;
  /** Evaluated lazily, after `transform` ran, so it can reflect what changed. */
  commitMessage(): string;
  /** Receives the current file content (undefined when absent) and returns the new one. */
  transform(current: string | undefined): string;
}

export interface PushFileTransformResult {
  createdBranch: boolean;
  changed: boolean;
}

const GIT_ENV = {
  // Fail fast instead of hanging on a credential prompt inside the extension host.
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: 'true',
};

async function git(args: string[], options: { cwd?: string; timeout?: number } = {}) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: options.cwd,
      timeout: options.timeout ?? 30_000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, ...GIT_ENV },
    });
    return stdout;
  } catch (error) {
    throw new Error(gitErrorMessage(error, args));
  }
}

function gitErrorMessage(error: unknown, args: string[]): string {
  if (isExecError(error) && error.code === 'ENOENT') {
    return 'git executable not found. Install git in the workbench image.';
  }
  const stderr = isExecError(error) ? String(error.stderr ?? '').trim() : '';
  const detail = stderr || (error instanceof Error ? error.message : String(error));
  if (detail.includes('Authentication failed') || detail.includes('could not read Username')) {
    return `Git authentication failed for "git ${args[0]}". Configure credentials for the repository in the workbench first. (${detail})`;
  }
  return `git ${args.join(' ')} failed: ${detail}`;
}

interface ExecError extends Error {
  code?: number | string;
  stderr?: string | Buffer;
}

function isExecError(error: unknown): error is ExecError {
  return error instanceof Error && ('stderr' in error || 'code' in error);
}

async function remoteBranchExists(repoUrl: string, branch: string): Promise<boolean> {
  const output = await git(['ls-remote', '--heads', repoUrl, branch], { timeout: 20_000 });
  return output.trim().length > 0;
}

async function resolveIdentity(dir: string): Promise<{ name?: string; email?: string }> {
  const identity: { name?: string; email?: string } = {};
  try {
    const name = await git(['config', '--get', 'user.name'], { cwd: dir });
    identity.name = name.trim() || undefined;
  } catch {
    // unset
  }
  try {
    const email = await git(['config', '--get', 'user.email'], { cwd: dir });
    identity.email = email.trim() || undefined;
  } catch {
    // unset
  }
  return identity;
}

/**
 * Clones the repository shallowly onto `branch` (creating it from `targetBranch`
 * when needed), applies `transform` to the file, and pushes the commit using
 * the credentials already configured in the workbench.
 */
export async function pushFileTransform(
  options: PushFileTransformOptions
): Promise<PushFileTransformResult> {
  const dir = await mkdtemp(join(tmpdir(), 'depinference-'));
  try {
    const branchExists = await remoteBranchExists(options.repoUrl, options.branch);
    const cloneBranch = branchExists ? options.branch : options.targetBranch;
    await git(
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        cloneBranch,
        '--single-branch',
        options.repoUrl,
        dir,
      ],
      { timeout: 120_000 }
    );

    if (!branchExists) {
      await git(['checkout', '-b', options.branch], { cwd: dir });
    }

    const filePath = join(dir, options.filePath);
    let current: string | undefined;
    try {
      current = await readFile(filePath, 'utf8');
    } catch {
      current = undefined;
    }

    const next = options.transform(current);
    if (current === next) {
      return { createdBranch: !branchExists, changed: false };
    }

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, next, 'utf8');

    await git(['add', '--', options.filePath], { cwd: dir });

    const identity = await resolveIdentity(dir);
    const commitArgs: string[] = [];
    if (!identity.name) {
      commitArgs.push('-c', 'user.name=DepInference');
    }
    if (!identity.email) {
      commitArgs.push('-c', 'user.email=depinference@workbench');
    }
    commitArgs.push('commit', '-m', options.commitMessage());
    await git(commitArgs, { cwd: dir });

    await git(['push', '-u', 'origin', options.branch], { cwd: dir, timeout: 60_000 });

    return { createdBranch: !branchExists, changed: true };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
