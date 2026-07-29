import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ganache from "ganache";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

function compileFactory() {
  const sources = Object.fromEntries(
    ["MandateFactory.sol", "MandateVault.sol"].map((file) => {
      const sourcePath = path.resolve("contracts", file);
      if (!fs.existsSync(sourcePath)) throw new Error(`contracts/${file} is missing`);
      return [file, { content: fs.readFileSync(sourcePath, "utf8") }];
    }),
  );
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
        },
      }),
      {
        import(importPath) {
          const local = path.resolve("contracts", path.basename(importPath));
          const dependency = path.resolve("node_modules", importPath);
          const resolved = fs.existsSync(local) ? local : dependency;
          return fs.existsSync(resolved)
            ? { contents: fs.readFileSync(resolved, "utf8") }
            : { error: `Import not found: ${importPath}` };
        },
      },
    ),
  );
  const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
  assert.deepEqual(errors, [], errors.map((entry) => entry.formattedMessage).join("\n"));
  return {
    factory: output.contracts["MandateFactory.sol"].MandateFactory,
    vault: output.contracts["MandateVault.sol"].MandateVault,
  };
}

test("factory creates a user-owned vault and indexes it by owner", async () => {
  const contracts = compileFactory();
  const provider = ganache.provider({ logging: { quiet: true } });
  const accounts = Object.entries(provider.getInitialAccounts()).map(
    ([address, details]) => ({
      address: getAddress(address),
      account: privateKeyToAccount(details.secretKey),
    }),
  );
  const [deployer, owner, executor, treasury] = accounts;
  const publicClient = createPublicClient({ transport: custom(provider) });
  const wallet = createWalletClient({ transport: custom(provider) });
  const deployHash = await wallet.deployContract({
    account: deployer.account,
    abi: contracts.factory.abi,
    bytecode: `0x${contracts.factory.evm.bytecode.object}`,
    args: [executor.address],
  });
  const factory = (await publicClient.waitForTransactionReceipt({ hash: deployHash }))
    .contractAddress;
  const block = await publicClient.getBlock();
  const endAt = Number(block.timestamp) + 3600;

  const createHash = await wallet.writeContract({
    account: owner.account,
    address: factory,
    abi: contracts.factory.abi,
    functionName: "createMandate",
    args: [treasury.address, endAt, 86400],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
  const created = receipt.logs
    .map((log) => {
      try {
        return decodeEventLog({ abi: contracts.factory.abi, ...log });
      } catch {
        return null;
      }
    })
    .find((log) => log?.eventName === "MandateCreated");

  assert.ok(created);
  assert.equal(created.args.owner, owner.address);
  assert.equal(created.args.executor, executor.address);
  assert.equal(created.args.treasury, treasury.address);
  assert.equal(
    await publicClient.readContract({
      address: created.args.vault,
      abi: contracts.vault.abi,
      functionName: "owner",
    }),
    owner.address,
  );
  assert.deepEqual(
    await publicClient.readContract({
      address: factory,
      abi: contracts.factory.abi,
      functionName: "getMandatesByOwner",
      args: [owner.address],
    }),
    [created.args.vault],
  );
  assert.equal(
    await publicClient.readContract({
      address: factory,
      abi: contracts.factory.abi,
      functionName: "platformExecutor",
    }),
    executor.address,
  );
  assert.equal(
    await publicClient.readContract({
      address: factory,
      abi: contracts.factory.abi,
      functionName: "isMandate",
      args: [created.args.vault],
    }),
    true,
  );
});
