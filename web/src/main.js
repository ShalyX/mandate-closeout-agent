import "./styles.css";
import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import { summarizeMandate } from "./product-state.js";

const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const VAULT = "0x63001f6B89bb212895e6f4B5c074Dc3E86B11a0a";
const TOKEN = "0x56E766e5ED1cC545B60F43651F67b1371d9ead5f";
const SPENDER = "0x1000000000000000000000000000000000000003";
const RECIPIENT = "0x1000000000000000000000000000000000000002";
const TREASURY = "0x1000000000000000000000000000000000000001";

const vaultAbi = parseAbi([
  "function finalized() view returns (bool)",
  "function active() view returns (bool)",
  "function executor() view returns (address)",
]);
const tokenAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
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
};

function compactAddress(value) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function tokenAmount(value) {
  return `${Number(formatUnits(value, 18)).toLocaleString()} mUSD`;
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
readLiveState();
window.setInterval(readLiveState, 30_000);
