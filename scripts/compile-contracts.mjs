import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const sourceNames = [
  "MandateFactory.sol",
  "MandateVault.sol",
  "DemoToken.sol",
];
const outputDirectory = path.resolve("artifacts", "contracts");
const input = {
  language: "Solidity",
  sources: Object.fromEntries(
    sourceNames.map((sourceName) => [
      sourceName,
      { content: fs.readFileSync(path.resolve("contracts", sourceName), "utf8") },
    ]),
  ),
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": [
          "abi",
          "evm.bytecode.object",
          "evm.deployedBytecode.object",
          "metadata",
        ],
      },
    },
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
const errors = output.errors ?? [];
for (const entry of errors) process.stderr.write(`${entry.formattedMessage}\n`);
if (errors.some((entry) => entry.severity === "error")) process.exit(1);

fs.mkdirSync(outputDirectory, { recursive: true });
for (const [sourceName, contractName] of [
  ["MandateFactory.sol", "MandateFactory"],
  ["MandateVault.sol", "MandateVault"],
  ["DemoToken.sol", "DemoToken"],
]) {
  const contract = output.contracts[sourceName][contractName];
  fs.writeFileSync(
    path.join(outputDirectory, `${contractName}.json`),
    `${JSON.stringify(contract, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(outputDirectory, `${contractName}.abi.json`),
    `${JSON.stringify(contract.abi, null, 2)}\n`,
  );
}
console.log(
  `Compiled MandateFactory, MandateVault, and DemoToken with solc ${solc.version()}`,
);
