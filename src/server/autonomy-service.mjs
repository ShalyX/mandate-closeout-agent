function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function createAutonomyService({
  verifyAuthorization,
  isFactoryMandate,
  readOwner,
  readLifecycle,
  saveAuthorization,
}) {
  return {
    async register(intent) {
      if (!(await verifyAuthorization(intent))) {
        throw serviceError("AUTHORIZATION_INVALID", "Invalid autonomous authorization");
      }
      if (!(await isFactoryMandate(intent.vault))) {
        throw serviceError("UNKNOWN_VAULT", "Vault is not registered by the Mandate factory");
      }
      const chainOwner = await readOwner(intent.vault);
      if (chainOwner.toLowerCase() !== intent.owner.toLowerCase()) {
        throw serviceError("OWNER_MISMATCH", "Signer is not the mandate owner");
      }
      const lifecycle = await readLifecycle(intent.vault);
      if (!lifecycle.active || lifecycle.finalized) {
        throw serviceError("INVALID_LIFECYCLE", "Mandate must be active and unfinished");
      }
      if (intent.validUntil < lifecycle.endAt) {
        throw serviceError(
          "AUTHORIZATION_TOO_SHORT",
          "Authorization expires before mandate closeout",
        );
      }
      const record = { ...intent, status: "armed" };
      await saveAuthorization(record);
      return {
        vault: intent.vault,
        owner: intent.owner,
        status: "armed",
        validUntil: intent.validUntil,
      };
    },
  };
}
