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
  getAddress,
  keccak256,
  parseEther,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const mockTokenSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
`;

function compileContracts() {
  const vaultPath = path.resolve("contracts/MandateVault.sol");
  if (!fs.existsSync(vaultPath)) {
    throw new Error("contracts/MandateVault.sol is missing");
  }

  const input = {
    language: "Solidity",
    sources: {
      "MandateVault.sol": { content: fs.readFileSync(vaultPath, "utf8") },
      "MockUSDC.sol": { content: mockTokenSource },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };

  const output = JSON.parse(
    solc.compile(JSON.stringify(input), {
      import(importPath) {
        const resolved = path.resolve("node_modules", importPath);
        return fs.existsSync(resolved)
          ? { contents: fs.readFileSync(resolved, "utf8") }
          : { error: `Import not found: ${importPath}` };
      },
    }),
  );
  const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
  assert.deepEqual(errors, [], errors.map((entry) => entry.formattedMessage).join("\n"));
  return {
    vault: output.contracts["MandateVault.sol"].MandateVault,
    token: output.contracts["MockUSDC.sol"].MockUSDC,
  };
}

async function deploy(wallet, publicClient, account, contract, args = []) {
  const hash = await wallet.deployContract({
    account,
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress;
}

test("deployment rejects a zero emergency recovery delay", async () => {
  const contracts = compileContracts();
  const provider = ganache.provider({ logging: { quiet: true } });
  const initialAccounts = provider.getInitialAccounts();
  const accounts = Object.entries(initialAccounts).map(([address, details]) => ({
    address: getAddress(address),
    account: privateKeyToAccount(details.secretKey),
  }));
  const [owner, executor, treasury] = accounts;
  const publicClient = createPublicClient({ transport: custom(provider) });
  const wallet = createWalletClient({ transport: custom(provider) });
  const block = await publicClient.getBlock();
  await assert.rejects(
    wallet.deployContract({
      account: owner.account,
      abi: contracts.vault.abi,
      bytecode: `0x${contracts.vault.evm.bytecode.object}`,
      args: [
        owner.address,
        executor.address,
        treasury.address,
        Number(block.timestamp) + 60,
        0,
      ],
    }),
  );
});

test("executor settles one pre-authorized obligation after mandate expiry", async () => {
  const contracts = compileContracts();
  const provider = ganache.provider({ logging: { quiet: true } });
  const initialAccounts = provider.getInitialAccounts();
  const accounts = Object.entries(initialAccounts).map(([address, details]) => ({
    address: getAddress(address),
    account: privateKeyToAccount(details.secretKey),
  }));
  const [owner, executor, treasury, recipient, replacementExecutor] = accounts;
  const publicClient = createPublicClient({ transport: custom(provider) });
  const wallet = createWalletClient({ transport: custom(provider) });
  const block = await publicClient.getBlock();
  const endAt = Number(block.timestamp) + 60;
  const amount = parseEther("125");

  const token = await deploy(wallet, publicClient, owner.account, contracts.token);
  const vault = await deploy(wallet, publicClient, owner.account, contracts.vault, [
    owner.address,
    executor.address,
    treasury.address,
    endAt,
    3600,
  ]);

  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: token,
      abi: contracts.token.abi,
      functionName: "mint",
      args: [vault, amount],
    }),
  });
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "addTrackedToken",
      args: [token],
    }),
  });
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "addObligation",
      args: [recipient.address, token, amount, endAt],
    }),
  });
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "activate",
    }),
  });
  await assert.rejects(
    publicClient.simulateContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "addObligation",
      args: [recipient.address, token, 1n, endAt],
    }),
  );
  await assert.rejects(
    publicClient.simulateContract({
      account: executor.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "pause",
    }),
  );

  await provider.request({ method: "evm_increaseTime", params: [61] });
  await provider.request({ method: "evm_mine", params: [] });
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "pause",
    }),
  });
  await assert.rejects(
    publicClient.simulateContract({
      account: executor.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "settleObligation",
      args: [0n],
    }),
  );
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "resume",
    }),
  });
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "replaceExecutor",
      args: [replacementExecutor.address],
    }),
  });
  await assert.rejects(
    publicClient.simulateContract({
      account: executor.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "settleObligation",
      args: [0n],
    }),
  );
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "replaceExecutor",
      args: [executor.address],
    }),
  });
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: executor.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "settleObligation",
      args: [0n],
    }),
  });
  await assert.rejects(
    publicClient.simulateContract({
      account: executor.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "settleObligation",
      args: [0n],
    }),
  );

  const balance = await publicClient.readContract({
    address: token,
    abi: contracts.token.abi,
    functionName: "balanceOf",
    args: [recipient.address],
  });
  const obligation = await publicClient.readContract({
    address: vault,
    abi: contracts.vault.abi,
    functionName: "obligations",
    args: [0n],
  });
  assert.equal(balance, amount);
  assert.equal(obligation[4], 1);
});

test("executor revokes allowance, sweeps residuals, finalizes, and loses authority", async () => {
  const contracts = compileContracts();
  const provider = ganache.provider({ logging: { quiet: true } });
  const initialAccounts = provider.getInitialAccounts();
  const accounts = Object.entries(initialAccounts).map(([address, details]) => ({
    address: getAddress(address),
    account: privateKeyToAccount(details.secretKey),
  }));
  const [owner, executor, treasury, recipient, spender] = accounts;
  const publicClient = createPublicClient({ transport: custom(provider) });
  const wallet = createWalletClient({ transport: custom(provider) });
  const block = await publicClient.getBlock();
  const endAt = Number(block.timestamp) + 60;
  const funded = parseEther("200");
  const initialAllowance = parseEther("50");

  const token = await deploy(wallet, publicClient, owner.account, contracts.token);
  const vault = await deploy(wallet, publicClient, owner.account, contracts.vault, [
    owner.address,
    executor.address,
    treasury.address,
    endAt,
    3600,
  ]);
  for (const [functionName, args] of [
    ["mint", [vault, funded]],
  ]) {
    await publicClient.waitForTransactionReceipt({
      hash: await wallet.writeContract({
        account: owner.account,
        address: token,
        abi: contracts.token.abi,
        functionName,
        args,
      }),
    });
  }
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "addTrackedToken",
      args: [token],
    }),
  });
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "addObligation",
      args: [recipient.address, token, parseEther("50"), endAt],
    }),
  });
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "addAllowanceTarget",
      args: [token, spender.address],
    }),
  });
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "configureAllowance",
      args: [0n, initialAllowance],
    }),
  });
  const [obligationCount, allowanceTargetCount, trackedTokenCount] =
    await Promise.all([
      publicClient.readContract({
        address: vault,
        abi: contracts.vault.abi,
        functionName: "obligationCount",
      }),
      publicClient.readContract({
        address: vault,
        abi: contracts.vault.abi,
        functionName: "allowanceTargetCount",
      }),
      publicClient.readContract({
        address: vault,
        abi: contracts.vault.abi,
        functionName: "trackedTokenCount",
      }),
    ]);
  assert.equal(obligationCount, 1n);
  assert.equal(allowanceTargetCount, 1n);
  assert.equal(trackedTokenCount, 1n);
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "activate",
    }),
  });
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "pause",
    }),
  });
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "requestEmergencyRecovery",
      args: [token, recipient.address],
    }),
  });
  await assert.rejects(
    publicClient.simulateContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "executeEmergencyRecovery",
      args: [0n],
    }),
  );
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "cancelObligation",
      args: [0n, keccak256(stringToHex("recipient dispute resolved offchain"))],
    }),
  });
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: owner.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "resume",
    }),
  });

  const configuredAllowance = await publicClient.readContract({
    address: token,
    abi: contracts.token.abi,
    functionName: "allowance",
    args: [vault, spender.address],
  });
  assert.equal(configuredAllowance, initialAllowance);

  await provider.request({ method: "evm_increaseTime", params: [61] });
  await provider.request({ method: "evm_mine", params: [] });
  await assert.rejects(
    publicClient.simulateContract({
      account: executor.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "sweepToken",
      args: [token],
    }),
  );
  await publicClient.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: executor.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "revokeAllowance",
      args: [0n],
    }),
  });
  await assert.rejects(
    publicClient.simulateContract({
      account: executor.account,
      address: vault,
      abi: contracts.vault.abi,
      functionName: "finalize",
    }),
  );
  for (const [functionName, args] of [
    ["sweepToken", [token]],
    ["finalize", []],
  ]) {
    await publicClient.waitForTransactionReceipt({
      hash: await wallet.writeContract({
        account: executor.account,
        address: vault,
        abi: contracts.vault.abi,
        functionName,
        args,
      }),
    });
  }

  const [allowance, vaultBalance, treasuryBalance, finalized, currentExecutor] =
    await Promise.all([
      publicClient.readContract({
        address: token,
        abi: contracts.token.abi,
        functionName: "allowance",
        args: [vault, spender.address],
      }),
      publicClient.readContract({
        address: token,
        abi: contracts.token.abi,
        functionName: "balanceOf",
        args: [vault],
      }),
      publicClient.readContract({
        address: token,
        abi: contracts.token.abi,
        functionName: "balanceOf",
        args: [treasury.address],
      }),
      publicClient.readContract({
        address: vault,
        abi: contracts.vault.abi,
        functionName: "finalized",
      }),
      publicClient.readContract({
        address: vault,
        abi: contracts.vault.abi,
        functionName: "executor",
      }),
    ]);
  assert.equal(allowance, 0n);
  assert.equal(vaultBalance, 0n);
  assert.equal(treasuryBalance, funded);
  assert.equal(finalized, true);
  assert.equal(currentExecutor, "0x0000000000000000000000000000000000000000");
});
