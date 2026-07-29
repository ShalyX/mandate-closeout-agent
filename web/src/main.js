import "./styles.css";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseAbi,
  parseUnits,
} from "viem";
import { sepolia } from "viem/chains";
import {
  buildAutonomyRevocationMessage,
  buildExecutionMessage,
} from "../../src/shared/execution-message.mjs";
import {
  prepareAutonomyAuthorization,
  prepareAllowanceTarget,
  prepareMandateCreation,
  prepareObligation,
  prepareTrackedToken,
  summarizeMandate,
} from "./product-state.js";

const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const FACTORY = "0x4977Bf6C7120b7335bA4c06e516E938FDDC6D9a5";
const VAULT = "0x63001f6B89bb212895e6f4B5c074Dc3E86B11a0a";
const TOKEN = "0x56E766e5ED1cC545B60F43651F67b1371d9ead5f";
const SPENDER = "0x1000000000000000000000000000000000000003";
const RECIPIENT = "0x1000000000000000000000000000000000000002";
const TREASURY = "0x1000000000000000000000000000000000000001";

const vaultAbi = parseAbi([
  "function finalized() view returns (bool)",
  "function active() view returns (bool)",
  "function paused() view returns (bool)",
  "function executor() view returns (address)",
  "function treasury() view returns (address)",
  "function endAt() view returns (uint64)",
  "function addTrackedToken(address token)",
  "function addObligation(address recipient,address token,uint128 amount,uint64 dueAt)",
  "function addAllowanceTarget(address token,address spender)",
  "function activate()",
  "function pause()",
  "function resume()",
]);
const factoryAbi = parseAbi([
  "function createMandate(address treasury,uint64 endAt,uint64 gracePeriod) returns (address vault)",
  "function getMandatesByOwner(address owner) view returns (address[])",
]);
const tokenAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address,uint256) returns (bool)",
]);
const client = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL, { timeout: 8_000 }),
});

const els = {
  state: document.querySelector("#live-state"),
  stateLabel: document.querySelector("#state-label"),
  vaultBalance: document.querySelector("#vault-balance"),
  allowance: document.querySelector("#allowance-value"),
  executor: document.querySelector("#executor-value"),
  checked: document.querySelector("#last-checked"),
  result: document.querySelector("#proof-result"),
  equation: document.querySelector("#equation"),
  replay: document.querySelector("#replay-button"),
  stage: document.querySelector("#closeout-stage"),
  walletButton: document.querySelector("#wallet-button"),
  walletStatus: document.querySelector("#wallet-status"),
  form: document.querySelector("#mandate-form"),
  treasury: document.querySelector("#treasury-input"),
  endAt: document.querySelector("#end-input"),
  grace: document.querySelector("#grace-input"),
  createButton: document.querySelector("#create-button"),
  formMessage: document.querySelector("#form-message"),
  refreshVaults: document.querySelector("#refresh-vaults"),
  vaultList: document.querySelector("#vault-list"),
  vaultControl: document.querySelector("#vault-control"),
  selectedVault: document.querySelector("#selected-vault"),
  selectedState: document.querySelector("#selected-state"),
  controlMessage: document.querySelector("#control-message"),
  controlForms: document.querySelectorAll(".control-form"),
  activateVault: document.querySelector("#activate-vault"),
  pauseVault: document.querySelector("#pause-vault"),
  resumeVault: document.querySelector("#resume-vault"),
  runCloseout: document.querySelector("#run-closeout"),
  armAutonomy: document.querySelector("#arm-autonomy"),
  revokeAutonomy: document.querySelector("#revoke-autonomy"),
};

let walletClient;
let account;
let selectedVault;
let selectedAuthorization;

function compactAddress(value) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function tokenAmount(value) {
  return `${Number(formatUnits(value, 18)).toLocaleString()} mUSD`;
}

function messageFrom(error) {
  if (error?.code === 4001) return "Request cancelled in wallet.";
  if (error?.name === "ContractFunctionExecutionError") {
    return "The contract rejected this request. Check the mandate details.";
  }
  return error?.shortMessage ?? error?.message ?? "Something went wrong.";
}

function setFormMessage(message, tone = "") {
  els.formMessage.textContent = message;
  els.formMessage.dataset.tone = tone;
}

function setBusy(busy) {
  els.createButton.disabled = busy || !account;
  els.walletButton.disabled = busy;
  els.refreshVaults.disabled = busy || !account;
  els.controlForms.forEach((form) => {
    form.querySelector("button").disabled = busy;
  });
  els.activateVault.disabled = busy;
  els.pauseVault.disabled = busy;
  els.resumeVault.disabled = busy;
  els.runCloseout.disabled = busy;
  els.armAutonomy.disabled = busy;
  els.revokeAutonomy.disabled = busy;
}

function setControlMessage(message, tone = "") {
  els.controlMessage.textContent = message;
  els.controlMessage.dataset.tone = tone;
}

async function ensureSepolia() {
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId === "0xaa36a7") return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }],
    });
  } catch (error) {
    throw new Error(
      error?.code === 4902
        ? "Add Ethereum Sepolia to your wallet, then try again."
        : "Switch your wallet to Ethereum Sepolia.",
    );
  }
}

async function loadMandates() {
  if (!account) return;
  els.vaultList.className = "empty-vaults";
  els.vaultList.textContent = "Reading factory index…";
  try {
    const vaults = await client.readContract({
      address: FACTORY,
      abi: factoryAbi,
      functionName: "getMandatesByOwner",
      args: [account],
    });
    if (vaults.length === 0) {
      els.vaultList.textContent =
        "No mandates yet. Create one and it will appear here after confirmation.";
      return;
    }
    const records = await Promise.all(
      vaults.map(async (address) => {
        const [treasury, endAt, active, paused, finalized] = await Promise.all([
          client.readContract({ address, abi: vaultAbi, functionName: "treasury" }),
          client.readContract({ address, abi: vaultAbi, functionName: "endAt" }),
          client.readContract({ address, abi: vaultAbi, functionName: "active" }),
          client.readContract({ address, abi: vaultAbi, functionName: "paused" }),
          client.readContract({ address, abi: vaultAbi, functionName: "finalized" }),
        ]);
        return { address, treasury, endAt, active, paused, finalized };
      }),
    );
    els.vaultList.className = "vault-cards";
    els.vaultList.replaceChildren(
      ...records.map((vault) => {
        const article = document.createElement("article");
        article.className = "vault-card";
        const state = vault.finalized
          ? "Closed"
          : vault.paused
            ? "Paused"
            : vault.active
              ? "Active"
              : "Draft";
        article.innerHTML = `
          <div><span class="micro-label">${state}</span><strong>${compactAddress(vault.address)}</strong></div>
          <dl>
            <div><dt>Closes</dt><dd>${new Date(Number(vault.endAt) * 1_000).toLocaleString()}</dd></div>
            <div><dt>Treasury</dt><dd>${compactAddress(vault.treasury)}</dd></div>
          </dl>
          <a href="https://sepolia.etherscan.io/address/${vault.address}" target="_blank" rel="noreferrer">Inspect onchain ↗</a>
          <button type="button" data-vault="${vault.address}">Manage vault</button>
        `;
        return article;
      }),
    );
    els.vaultList.querySelectorAll("[data-vault]").forEach((button) => {
      button.addEventListener("click", async () => {
        selectedVault = records.find(
          (vault) => vault.address.toLowerCase() === button.dataset.vault.toLowerCase(),
        );
        await loadAutonomyStatus();
        renderSelectedVault();
      });
    });
    if (selectedVault) {
      selectedVault = records.find(
        (vault) => vault.address.toLowerCase() === selectedVault.address.toLowerCase(),
      );
      if (selectedVault) {
        await loadAutonomyStatus();
        renderSelectedVault();
      }
    }
  } catch (error) {
    els.vaultList.textContent = `Could not load mandates. ${messageFrom(error)}`;
  }
}

async function loadAutonomyStatus() {
  selectedAuthorization = null;
  if (!selectedVault) return;
  try {
    const response = await fetch(
      `/api/autonomy-status?vault=${encodeURIComponent(selectedVault.address)}`,
      { cache: "no-store" },
    );
    const result = await response.json();
    if (response.ok) selectedAuthorization = result.authorization;
  } catch {}
}

function renderSelectedVault({ scroll = true } = {}) {
  if (!selectedVault) {
    els.vaultControl.hidden = true;
    return;
  }
  const state = selectedVault.finalized
    ? "Closed"
    : selectedVault.paused
      ? "Paused"
      : selectedVault.active
        ? "Active"
        : "Draft";
  els.vaultControl.hidden = false;
  els.selectedVault.textContent = selectedVault.address;
  els.selectedState.textContent = state;
  els.controlForms.forEach((form) => {
    form.hidden = selectedVault.active || selectedVault.finalized;
  });
  els.activateVault.hidden = selectedVault.active || selectedVault.finalized;
  els.pauseVault.hidden =
    !selectedVault.active || selectedVault.paused || selectedVault.finalized;
  els.resumeVault.hidden =
    !selectedVault.active || !selectedVault.paused || selectedVault.finalized;
  els.runCloseout.hidden =
    !selectedVault.active ||
    selectedVault.paused ||
    selectedVault.finalized ||
    Boolean(selectedAuthorization && !["expired", "revoked"].includes(selectedAuthorization.status));
  els.armAutonomy.hidden =
    !selectedVault.active ||
    selectedVault.paused ||
    selectedVault.finalized ||
    Boolean(selectedAuthorization && !["expired", "revoked"].includes(selectedAuthorization.status));
  els.revokeAutonomy.hidden =
    selectedVault.finalized ||
    !selectedAuthorization ||
    ["completed", "expired", "revoked"].includes(selectedAuthorization.status);
  setControlMessage(
    selectedVault.finalized
      ? "This mandate is finalized. Its executor authority has been removed."
      : selectedAuthorization && !["expired", "revoked"].includes(selectedAuthorization.status)
        ? `Autonomous closeout: ${selectedAuthorization.status}.${selectedAuthorization.lastAction ? ` Last action: ${selectedAuthorization.lastAction}.` : ""}${selectedAuthorization.executionId ? ` KeeperHub execution: ${selectedAuthorization.executionId}.` : ""} No further wallet signatures are required.`
      : selectedVault.active
        ? "Configuration locked. Authorize autonomous closeout once, or run a manual fallback step."
        : "Configure the draft, fund it, then activate. Configuration locks after activation.",
  );
  if (scroll) {
    els.vaultControl.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function revokeAutonomousCloseout() {
  if (!selectedVault || !walletClient || !account) return;
  setBusy(true);
  try {
    const intent = {
      vault: selectedVault.address,
      owner: account,
      chainId: sepolia.id,
      issuedAt: Math.floor(Date.now() / 1_000),
      nonce: crypto.randomUUID(),
    };
    setControlMessage("Sign to permanently disarm autonomous closeout…");
    intent.signature = await walletClient.signMessage({
      account,
      message: buildAutonomyRevocationMessage(intent),
    });
    const response = await fetch("/api/autonomy-revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intent),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(`Revocation failed. Request ${result.requestId ?? "unknown"}.`);
    }
    await loadAutonomyStatus();
    renderSelectedVault();
    setControlMessage("Autonomous closeout revoked.", "success");
  } catch (error) {
    setControlMessage(messageFrom(error), "error");
  } finally {
    setBusy(false);
  }
}

async function armAutonomousCloseout() {
  if (!selectedVault || !walletClient || !account) return;
  setBusy(true);
  try {
    const issuedAt = Math.floor(Date.now() / 1_000);
    const intent = prepareAutonomyAuthorization({
      vault: selectedVault.address,
      owner: account,
      chainId: sepolia.id,
      issuedAt,
      endAt: selectedVault.endAt,
      nonce: crypto.randomUUID(),
    });
    setControlMessage("Review and sign one bounded closeout authorization…");
    intent.signature = await walletClient.signMessage({
      account,
      message: buildExecutionMessage(intent),
    });
    setControlMessage("Arming the autonomous worker…");
    const response = await fetch("/api/autonomy-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intent),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        `Autonomous authorization failed${result.code ? ` (${result.code})` : ""}. Request ${result.requestId ?? "unknown"}.`,
      );
    }
    await loadAutonomyStatus();
    renderSelectedVault();
    setControlMessage(
      "Autonomous closeout armed. You can leave this page; the worker will act after the close time.",
      "success",
    );
  } catch (error) {
    setControlMessage(messageFrom(error), "error");
  } finally {
    setBusy(false);
  }
}

async function runCloseoutStep() {
  if (!selectedVault || !walletClient || !account) return;
  setBusy(true);
  try {
    const intent = {
      vault: selectedVault.address,
      owner: account,
      chainId: sepolia.id,
      issuedAt: Math.floor(Date.now() / 1_000),
      nonce: crypto.randomUUID(),
    };
    setControlMessage("Sign the one-step closeout authorization in your wallet…");
    intent.signature = await walletClient.signMessage({
      account,
      message: buildExecutionMessage(intent),
    });
    setControlMessage("KeeperHub is simulating the next deterministic action…");
    const response = await fetch("/api/execute-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intent),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        result.error === "execution_rejected"
          ? "Closeout is not eligible yet or the next action failed simulation."
          : result.error === "dependency_unavailable"
            ? `Execution dependency unavailable${result.stage ? ` at ${result.stage}` : ""}${result.code ? ` (${result.code})` : ""}. Request ${result.requestId}.`
            : `The execution service failed${result.stage ? ` at ${result.stage}` : ""}${result.code ? ` (${result.code})` : ""}. Request ${result.requestId ?? "unknown"}.`,
      );
    }
    setControlMessage(
      `KeeperHub accepted ${result.action.kind}. Execution ${result.executionId}.`,
      "success",
    );
    await loadMandates();
  } catch (error) {
    setControlMessage(messageFrom(error), "error");
  } finally {
    setBusy(false);
  }
}

async function tokenMetadata(token) {
  const [decimals, symbol] = await Promise.all([
    client.readContract({ address: token, abi: tokenAbi, functionName: "decimals" }),
    client
      .readContract({ address: token, abi: tokenAbi, functionName: "symbol" })
      .catch(() => "tokens"),
  ]);
  return { decimals, symbol };
}

async function writeAndConfirm({ address, abi, functionName, args, pending, success }) {
  if (!walletClient || !account || !selectedVault) return;
  setBusy(true);
  setControlMessage(pending);
  try {
    await ensureSepolia();
    const hash = await walletClient.writeContract({
      address,
      abi,
      functionName,
      args,
      account,
      chain: sepolia,
    });
    setControlMessage(`Submitted ${compactAddress(hash)}. Waiting for Sepolia…`);
    await client.waitForTransactionReceipt({ hash, confirmations: 1 });
    setControlMessage(success, "success");
    await loadMandates();
  } catch (error) {
    setControlMessage(messageFrom(error), "error");
  } finally {
    setBusy(false);
  }
}

async function configureVault(event) {
  event.preventDefault();
  if (!selectedVault) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    if (form.dataset.action === "track-token") {
      const token = prepareTrackedToken(String(data.get("token")).trim());
      return writeAndConfirm({
        address: selectedVault.address,
        abi: vaultAbi,
        functionName: "addTrackedToken",
        args: [token],
        pending: "Confirm the tracked token in your wallet…",
        success: "Token added to the closeout inventory.",
      });
    }
    if (form.dataset.action === "fund") {
      const token = prepareTrackedToken(String(data.get("token")).trim());
      const { decimals, symbol } = await tokenMetadata(token);
      const amount = parseUnits(String(data.get("amount")).trim(), decimals);
      if (amount <= 0n) throw new Error("Funding amount must be greater than zero");
      return writeAndConfirm({
        address: token,
        abi: tokenAbi,
        functionName: "transfer",
        args: [selectedVault.address, amount],
        pending: `Confirm the ${symbol} transfer in your wallet…`,
        success: `${data.get("amount")} ${symbol} transferred to the vault.`,
      });
    }
    if (form.dataset.action === "obligation") {
      const token = prepareTrackedToken(String(data.get("token")).trim());
      const { decimals } = await tokenMetadata(token);
      const obligation = prepareObligation({
        recipient: String(data.get("recipient")).trim(),
        token,
        amount: parseUnits(String(data.get("amount")).trim(), decimals),
        dueAt: BigInt(Math.floor(new Date(String(data.get("dueAt"))).getTime() / 1_000)),
        mandateEndAt: selectedVault.endAt,
      });
      return writeAndConfirm({
        address: selectedVault.address,
        abi: vaultAbi,
        functionName: "addObligation",
        args: [
          obligation.recipient,
          obligation.token,
          obligation.amount,
          obligation.dueAt,
        ],
        pending: "Confirm the pre-authorized obligation in your wallet…",
        success: "Required obligation added.",
      });
    }
    const target = prepareAllowanceTarget({
      token: String(data.get("token")).trim(),
      spender: String(data.get("spender")).trim(),
    });
    return writeAndConfirm({
      address: selectedVault.address,
      abi: vaultAbi,
      functionName: "addAllowanceTarget",
      args: [target.token, target.spender],
      pending: "Confirm the allowance target in your wallet…",
      success: "Allowance target registered for closeout.",
    });
  } catch (error) {
    setControlMessage(messageFrom(error), "error");
  }
}

function lifecycleWrite(functionName, pending, success) {
  if (!selectedVault) return;
  return writeAndConfirm({
    address: selectedVault.address,
    abi: vaultAbi,
    functionName,
    args: [],
    pending,
    success,
  });
}

async function connectWallet() {
  if (!window.ethereum) {
    setFormMessage("No browser wallet found. Open this page in a wallet browser.", "error");
    return;
  }
  setBusy(true);
  try {
    await ensureSepolia();
    const [selected] = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    account = selected;
    walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: custom(window.ethereum),
    });
    els.walletButton.textContent = compactAddress(account);
    els.walletStatus.textContent = `Owner ${compactAddress(account)}`;
    els.treasury.value ||= account;
    setFormMessage("");
    setBusy(false);
    await loadMandates();
  } catch (error) {
    setFormMessage(messageFrom(error), "error");
    setBusy(false);
  }
}

async function createMandate(event) {
  event.preventDefault();
  if (!walletClient || !account) return connectWallet();
  setBusy(true);
  setFormMessage("Confirm mandate creation in your wallet…");
  try {
    await ensureSepolia();
    const mandate = prepareMandateCreation({
      treasury: els.treasury.value.trim(),
      endAt: els.endAt.value,
      graceHours: els.grace.value,
    });
    const hash = await walletClient.writeContract({
      address: FACTORY,
      abi: factoryAbi,
      functionName: "createMandate",
      args: [mandate.treasury, mandate.endAt, mandate.gracePeriod],
      account,
      chain: sepolia,
    });
    setFormMessage(`Transaction submitted: ${compactAddress(hash)}. Waiting for Sepolia…`);
    await client.waitForTransactionReceipt({ hash, confirmations: 1 });
    setFormMessage("Mandate created. It is now indexed to your wallet.", "success");
    await loadMandates();
  } catch (error) {
    setFormMessage(messageFrom(error), "error");
  } finally {
    setBusy(false);
  }
}

async function readLiveState() {
  els.stateLabel.textContent = "Reading Sepolia";
  els.state.classList.remove("is-final", "is-error");

  try {
    const [finalized, active, executor, vaultBalance, allowance, paid, swept] =
      await Promise.all([
        client.readContract({
          address: VAULT,
          abi: vaultAbi,
          functionName: "finalized",
        }),
        client.readContract({
          address: VAULT,
          abi: vaultAbi,
          functionName: "active",
        }),
        client.readContract({
          address: VAULT,
          abi: vaultAbi,
          functionName: "executor",
        }),
        client.readContract({
          address: TOKEN,
          abi: tokenAbi,
          functionName: "balanceOf",
          args: [VAULT],
        }),
        client.readContract({
          address: TOKEN,
          abi: tokenAbi,
          functionName: "allowance",
          args: [VAULT, SPENDER],
        }),
        client.readContract({
          address: TOKEN,
          abi: tokenAbi,
          functionName: "balanceOf",
          args: [RECIPIENT],
        }),
        client.readContract({
          address: TOKEN,
          abi: tokenAbi,
          functionName: "balanceOf",
          args: [TREASURY],
        }),
      ]);

    const summary = summarizeMandate({
      funded: 1000n,
      paid: paid / 10n ** 18n,
      swept: swept / 10n ** 18n,
      vaultBalance,
      allowance,
      finalized,
      executor,
    });

    els.stateLabel.textContent = summary.status;
    els.state.classList.toggle("is-final", summary.authorityRemoved && !active);
    els.vaultBalance.textContent = tokenAmount(vaultBalance);
    els.allowance.textContent = tokenAmount(allowance);
    els.executor.textContent = compactAddress(executor);
    els.checked.textContent = new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
    els.result.textContent = summary.equation;
    els.equation.textContent = summary.balanced
      ? `${tokenAmount(paid)} paid + ${tokenAmount(swept)} returned`
      : "Balance reconciliation failed";
  } catch {
    els.stateLabel.textContent = "RPC unavailable";
    els.state.classList.add("is-error");
    els.checked.textContent = "Live read failed";
  }
}

function replayCloseout() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  els.stage.classList.remove("is-replaying");
  void els.stage.offsetWidth;
  els.stage.classList.add("is-replaying");
  els.replay.disabled = true;
  window.setTimeout(() => {
    els.replay.disabled = false;
  }, 4600);
}

els.replay.addEventListener("click", replayCloseout);
els.walletButton.addEventListener("click", connectWallet);
els.form.addEventListener("submit", createMandate);
els.refreshVaults.addEventListener("click", loadMandates);
els.controlForms.forEach((form) =>
  form.addEventListener("submit", configureVault),
);
els.activateVault.addEventListener("click", () =>
  lifecycleWrite(
    "activate",
    "Confirm activation. The draft configuration will lock.",
    "Mandate activated. KeeperHub can execute only after the close date.",
  ),
);
els.pauseVault.addEventListener("click", () =>
  lifecycleWrite("pause", "Confirm pause in your wallet…", "Mandate paused."),
);
els.resumeVault.addEventListener("click", () =>
  lifecycleWrite("resume", "Confirm resume in your wallet…", "Mandate resumed."),
);
els.runCloseout.addEventListener("click", runCloseoutStep);
els.armAutonomy.addEventListener("click", armAutonomousCloseout);
els.revokeAutonomy.addEventListener("click", revokeAutonomousCloseout);
window.ethereum?.on?.("accountsChanged", () => {
  account = undefined;
  walletClient = undefined;
  selectedVault = undefined;
  els.vaultControl.hidden = true;
  els.walletButton.textContent = "Connect wallet";
  els.walletStatus.textContent = "Wallet changed — reconnect to continue";
  setBusy(false);
});
readLiveState();
window.setInterval(readLiveState, 30_000);
window.setInterval(async () => {
  if (!selectedVault) return;
  await loadAutonomyStatus();
  renderSelectedVault({ scroll: false });
}, 20_000);
