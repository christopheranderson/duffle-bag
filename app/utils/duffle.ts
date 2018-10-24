import * as path from 'path';

import { Errorable, succeeded } from '../utils/errorable';
import * as shell from '../utils/shell';
import * as pairs from '../utils/pairs';

export interface BinaryInfo {
  readonly path: string;
  readonly version: string;
}

async function invokeObj<T>(sh: shell.Shell, command: string, args: string, opts: shell.ExecOpts, fn: (stdout: string) => T): Promise<Errorable<T>> {
    const bin = await findDuffleBinary(sh);
    if (!bin) {
      return { succeeded: false, error: ["Can't find Duffle on this machine. Install it on your system PATH and restart the installer."] };
    }
    const cmd = `${bin.path} ${command} ${args}`;
    console.log(`$ ${cmd}`);
    return await sh.execObj<T>(
        cmd,
        `duffle ${command}`,
        opts,
        andLog(fn)
    );
}

function andLog<T>(fn: (s: string) => T): (s: string) => T {
    return (s: string) => {
        console.log(s);
        return fn(s);
    };
}

export function home(sh: shell.Shell): string {
    return process.env['DUFFLE_HOME'] || path.join(sh.home(), '.duffle');
}

export function list(sh: shell.Shell): Promise<Errorable<string[]>> {
    function parse(stdout: string): string[] {
        return stdout.split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
    }
    return invokeObj(sh, 'list', '', {}, parse);
}

export async function listRepos(sh: shell.Shell): Promise<Errorable<string[]>> {
    return { succeeded: true, result: ["hub.cnlabs.io"] };
}

export function listCredentialSets(sh: shell.Shell): Promise<Errorable<string[]>> {
    function parse(stdout: string): string[] {
        return stdout.split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
    }
    return invokeObj(sh, 'credentials list', '', {}, parse);
}

export async function upgrade(sh: shell.Shell, bundleName: string): Promise<Errorable<null>> {
    return await invokeObj(sh, 'upgrade', bundleName, {}, (s) => null);
}

export async function uninstall(sh: shell.Shell, bundleName: string): Promise<Errorable<null>> {
    return await invokeObj(sh, 'uninstall', bundleName, {}, (s) => null);
}

export async function pushFile(sh: shell.Shell, filePath: string, repo: string): Promise<Errorable<null>> {
    return await invokeObj(sh, 'push', `-f "${filePath}" --repo ${repo}`, {}, (s) => null);
}

export async function installFile(sh: shell.Shell, bundleFilePath: string, name: string, params: { [key: string]: string }, credentialSet: string | undefined): Promise<Errorable<null>> {
    return await invokeObj(sh, 'install', `${name} -f "${bundleFilePath}" ${paramsArgs(params)} ${credentialArg(credentialSet)}`, {}, (s) => null);
}

export async function installBundle(sh: shell.Shell, bundleName: string, name: string, params: { [key: string]: string }, credentialSet: string | undefined): Promise<Errorable<null>> {
    return await invokeObj(sh, 'install', `${name} ${bundleName} ${paramsArgs(params)} ${credentialArg(credentialSet)}`, {}, (s) => null);
}

function paramsArgs(parameters: { [key: string]: string }): string {
    return pairs.fromStringMap(parameters)
        .filter((p) => !!p.value)
        .map((p) => `--set ${p.key}=${shell.safeValue(p.value)}`)
        .join(' ');
}

function credentialArg(credentialSet: string | undefined): string {
    if (credentialSet) {
        return `-c ${credentialSet}`;
    }
    return '';
}

export async function addCredentialSets(sh: shell.Shell, files: string[]): Promise<Errorable<null>> {
    const filesArg = files.map((f) => `"${f}"`).join(' ');
    return await invokeObj(sh, 'credential add', filesArg, {}, (s) => null);
}

export async function deleteCredentialSet(sh: shell.Shell, credentialSetName: string): Promise<Errorable<null>> {
    return await invokeObj(sh, 'credential remove', credentialSetName, {}, (s) => null);
}

export async function generateCredentialsForFile(sh: shell.Shell, bundleFilePath: string, name: string): Promise<Errorable<null>> {
    return await invokeObj(sh, 'credentials generate', `${name} -f "${bundleFilePath}"`, {}, (s) => null);
}

export async function generateCredentialsForBundle(sh: shell.Shell, bundleName: string, name: string): Promise<Errorable<null>> {
    return await invokeObj(sh, 'credentials generate', `${name} ${bundleName}`, {}, (s) => null);
}

// Cache
let duffle: BinaryInfo | undefined = undefined;

export async function findDuffleBinary(sh: shell.Shell): Promise<BinaryInfo | undefined> {
  if (!duffle) {
    duffle = await findDuffleBinaryCore(sh);
  }
  return duffle;
}

async function findDuffleBinaryCore(sh: shell.Shell): Promise<BinaryInfo | undefined> {
  // Use the user's installed duffle if they have one
  const sr = await sh.exec('duffle version');
  if (succeeded(sr) && sr.result.code === 0) {
    return { path: 'duffle', version: sr.result.stdout.trim() };
  }

  // Look for an embedded duffle binary
  const resourcePath = duffleResourcePath(sh.platform());
  if (!resourcePath) {
    return undefined;
  }
  if (!process.resourcesPath) {
    return undefined;
  }
  const binPath = path.join(process.resourcesPath, resourcePath);
  const srr = await sh.exec(`${binPath} version`);
  if (succeeded(srr) && srr.result.code === 0) {
    return { path: binPath, version: srr.result.stdout.trim() };
  }

  // Give up
  return undefined;
}

function duffleResourcePath(platform: shell.Platform): string | undefined {
  switch (platform) {
    case shell.Platform.Windows:
      return "dufflebin/win32/duffle.exe";
    case shell.Platform.Linux:
      return "dufflebin/linux/duffle";
    case shell.Platform.MacOS:
      return "dufflebin/darwin/duffle";
    default:
      return undefined;
  }
}