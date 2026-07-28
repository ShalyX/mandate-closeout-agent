import fs from "node:fs";
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  getCreate2Address,
  keccak256,
  parseAbi,
} from "viem";

const executor = process.env.SPIKE_EXECUTOR;
if (!executor) {
  throw new Error("SPIKE_EXECUTOR is required");
}

const singletonFactory = "0xce0042B868300000d44A59004Da54A005ffdcf9f";
const salt = keccak256(new TextEncoder().encode("mandate-closeout-agent-milestone-0-v1"));
const artifact = JSON.parse(
  fs.readFileSync("artifacts/milestone-0/SpikeCounter.json", "utf8"),
);
const initCode = concatHex([
  `0x${artifact.evm.bytecode.object}`,
  encodeAbiParameters([{ type: "address" }], [executor]),
]);
const initCodeHash = keccak256(initCode);
const expectedAddress = getCreate2Address({
  from: singletonFactory,
  salt,
  bytecodeHash: initCodeHash,
});
const factoryAbi = parseAbi(["function deploy(bytes memory initCode, bytes32 salt) returns (address payable createdContract)"]);
const deployCalldata = encodeFunctionData({
  abi: factoryAbi,
  functionName: "deploy",
  args: [initCode, salt],
});

const output = {
  chainId: 11155111,
  singletonFactory,
  executor,
  salt,
  expectedAddress,
  initCode,
  deployCalldata,
  factoryAbi,
  spikeAbi: artifact.abi,
};

fs.mkdirSync("milestone-0/private", { recursive: true });
fs.writeFileSync(
  "milestone-0/private/deployment.json",
  `${JSON.stringify(output, null, 2)}\n`,
  { mode: 0o600 },
);

console.log(JSON.stringify({
  chainId: output.chainId,
  singletonFactory,
  executor,
  expectedAddress,
  salt,
}, null, 2));
