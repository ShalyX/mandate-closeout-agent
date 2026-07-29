import {
  encodeDeployData,
  getAddress,
  getCreate2Address,
  keccak256,
  stringToHex,
} from "viem";

export function prepareFactoryDeployment({
  singletonFactory,
  executor,
  bytecode,
  abi,
  saltLabel,
}) {
  const normalizedFactory = getAddress(singletonFactory);
  const normalizedExecutor = getAddress(executor);
  const initCode = encodeDeployData({
    abi,
    bytecode,
    args: [normalizedExecutor],
  });
  const salt = keccak256(stringToHex(saltLabel));
  return {
    singletonFactory: normalizedFactory,
    executor: normalizedExecutor,
    initCode,
    salt,
    expectedAddress: getCreate2Address({
      from: normalizedFactory,
      salt,
      bytecodeHash: keccak256(initCode),
    }),
  };
}
