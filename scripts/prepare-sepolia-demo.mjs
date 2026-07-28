import fs from "node:fs";
import {
  encodeDeployData,
  getCreate2Address,
  keccak256,
  stringToHex,
} from "viem";

const factory = "0xce0042B868300000d44A59004Da54A005ffdcf9f";
const wallet = "0x293b3e59f3d558862eadfb682c0e3e5531e9ba1e";
const treasury = "0x1000000000000000000000000000000000000001";
const recipient = "0x1000000000000000000000000000000000000002";
const spender = "0x1000000000000000000000000000000000000003";
const chainTimestamp = Number(process.env.SEPOLIA_TIMESTAMP);
if (!Number.isSafeInteger(chainTimestamp)) {
  throw new Error("SEPOLIA_TIMESTAMP is required");
}
const endAt = chainTimestamp + 20 * 60;
const recoveryDelay = 24 * 60 * 60;
const artifacts = {
  token: JSON.parse(
    fs.readFileSync("artifacts/contracts/DemoToken.json", "utf8"),
  ),
  vault: JSON.parse(
    fs.readFileSync("artifacts/contracts/MandateVault.json", "utf8"),
  ),
};

function deployment(contract, args, saltLabel) {
  const initCode = encodeDeployData({
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    args,
  });
  const salt = keccak256(stringToHex(saltLabel));
  return {
    initCode,
    salt,
    expectedAddress: getCreate2Address({
      from: factory,
      salt,
      bytecodeHash: keccak256(initCode),
    }),
  };
}

const token = deployment(artifacts.token, [wallet], "mandate-demo-token-v1");
const vault = deployment(
  artifacts.vault,
  [wallet, wallet, treasury, endAt, recoveryDelay],
  "mandate-closeout-vault-v1",
);
const plan = {
  chainId: 11155111,
  factory,
  wallet,
  treasury,
  recipient,
  spender,
  endAt,
  recoveryDelay,
  token,
  vault,
  amounts: {
    funded: "1000000000000000000000",
    obligation: "250000000000000000000",
    allowance: "100000000000000000000",
  },
};
fs.mkdirSync("deployments/private", { recursive: true, mode: 0o700 });
fs.writeFileSync(
  "deployments/private/demo-plan.json",
  `${JSON.stringify(plan, null, 2)}\n`,
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    {
      chainId: plan.chainId,
      token: token.expectedAddress,
      vault: vault.expectedAddress,
      treasury,
      recipient,
      spender,
      endAt,
      recoveryDelay,
    },
    null,
    2,
  ),
);
