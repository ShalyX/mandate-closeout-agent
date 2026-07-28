import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = process.cwd();
const sourcePath = path.join(root, "milestone-0", "SpikeCounter.sol");
const outputDirectory = path.join(root, "artifacts", "milestone-0");
const source = fs.readFileSync(sourcePath, "utf8");

const input = {
  language: "Solidity",
  sources: {
    "SpikeCounter.sol": { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = output.errors ?? [];
const fatalErrors = errors.filter((entry) => entry.severity === "error");

for (const entry of errors) {
  process.stderr.write(`${entry.formattedMessage}\n`);
}

if (fatalErrors.length > 0) {
  process.exit(1);
}

const contract = output.contracts["SpikeCounter.sol"].SpikeCounter;
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, "SpikeCounter.json"),
  `${JSON.stringify(contract, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(outputDirectory, "SpikeCounter.abi.json"),
  `${JSON.stringify(contract.abi, null, 2)}\n`,
);

console.log(`Compiled SpikeCounter with solc ${solc.version()}`);
