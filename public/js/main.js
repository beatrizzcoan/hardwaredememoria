/**
 * main.js
 * Este é o ponto de entrada. Ele importa as classes do simulador
 * e as conecta aos elementos do DOM (HTML).
 */

import { CONSTANTS, SystemState, MMU, PageFaultHandler } from "./simulation.js";

// --- Estado da Aplicação ---
let system;
let mmu;
let pfHandler;
let activePid = 1;
let pendingFault = null;

// --- Elementos do DOM ---
const dom = {
  mmuLog: document.getElementById("mmu-log"),
  ramContainer: document.getElementById("ram-container"),
  swapContainer: document.getElementById("swap-container"),
  swapPanel: document.getElementById("swap-panel"),
  modalContainer: document.getElementById("modal-container"),
  modalPrompt: document.getElementById("modal-prompt"),
  modalFrames: document.getElementById("modal-frames"),
};

// --- Funções de Renderização do DOM ---

/**
 * Atualiza todos os painéis da UI para refletir o 'system.state'.
 */
function renderAll() {
  renderControls();
  renderRam();
  renderSwap();
}

function renderControls() {
  for (let i = 1; i <= CONSTANTS.PROCESSES_COUNT; i++) {
    const div = document.getElementById(`p-${i}`);
    const vars = document.getElementById(`p-${i}-vars`);
    if (i === activePid) {
      div.classList.add("active");
      vars.classList.remove("hidden");
    } else {
      div.classList.remove("active");
      vars.classList.add("hidden");
    }
  }
  dom.swapPanel.style.display = system.part === 2 ? "block" : "none";
}

function renderRam() {
  dom.ramContainer.innerHTML = "";
  for (let i = 0; i < CONSTANTS.RAM_FRAMES; i++) {
    const frame = system.ram_state[i];
    let content = "Livre";
    let colorClass = "p-color-free";

    if (frame.owner_pid === -1) {
      content = i === CONSTANTS.FRAME_TABLES ? "Tabelas" : "Kernel";
      colorClass = "p-color-system";
    } else if (frame.owner_pid > 0) {
      content = `P${frame.owner_pid}: Pág ${frame.owner_page}`;
      colorClass = `p-color-${frame.owner_pid}`;
    }

    dom.ramContainer.innerHTML += `
            <div class="frame-item ${colorClass}">
                <span class="font-bold">Quadro ${i}</span>
                <span class="block">${content}</span>
            </div>
        `;
  }
}

function renderSwap() {
  dom.swapContainer.innerHTML = "";
  for (let i = 0; i < CONSTANTS.SWAP_FRAMES; i++) {
    const block = system.swap_state[i];
    let content = "Livre";
    let colorClass = "p-color-free";

    if (block.owner_pid > 0) {
      content = `P${block.owner_pid}: Pág ${block.owner_page}`;
      colorClass = `p-color-${block.owner_pid}`;
    }

    dom.swapContainer.innerHTML += `
            <div class="frame-item ${colorClass}">
                <span class="font-bold">Bloco ${i + CONSTANTS.RAM_FRAMES}</span>
                <span class="block">${content}</span>
            </div>
        `;
  }
}

function blinkFrame(frameNum) {
  const frameEl = dom.ramContainer.children[frameNum];
  if (frameEl) {
    frameEl.classList.add("frame-blink");
    setTimeout(() => {
      frameEl.classList.remove("frame-blink");
    }, 500); // Duração da animação
  }
}

function showModal() {
  if (!pendingFault) return;

  dom.modalPrompt.textContent = `P${pendingFault.pid} (Pág ${pendingFault.pageNum}) precisa ser alocada. Escolha um quadro (2-15):`;
  dom.modalFrames.innerHTML = ""; // Limpa botões antigos

  let hasFreeFrames = false;
  // Popula com quadros livres
  for (let i = CONSTANTS.USER_RAM_START; i < CONSTANTS.RAM_FRAMES; i++) {
    if (system.ram_state[i].owner_pid === 0) {
      hasFreeFrames = true;
      dom.modalFrames.innerHTML += `<button onclick="window.app.selectModalFrame(${i})" class="bg-green-100 text-green-800 p-2 rounded-md hover:bg-green-200">Quadro ${i} (Livre)</button>`;
    }
  }

  // Se não há livres, mostra os ocupados (para substituição)
  if (!hasFreeFrames) {
    dom.modalPrompt.textContent = `RAM Cheia! P${pendingFault.pid} (Pág ${pendingFault.pageNum}) precisa de espaço. Escolha um quadro para substituir (2-15):`;
    for (let i = CONSTANTS.USER_RAM_START; i < CONSTANTS.RAM_FRAMES; i++) {
      const frame = system.ram_state[i];
      dom.modalFrames.innerHTML += `<button onclick="window.app.selectModalFrame(${i})" class="p-color-${frame.owner_pid} p-2 rounded-md hover:opacity-80">Quadro ${i} (P${frame.owner_pid}: Pág ${frame.owner_page})</button>`;
    }
  }

  dom.modalContainer.classList.remove("hidden");
}

function hideModal() {
  dom.modalContainer.classList.add("hidden");
  pendingFault = null;
}

// --- Handlers de Eventos (Conectam UI ao Simulador) ---

const app = {
  switchPart: (part) => {
    system = new SystemState(part);
    mmu = new MMU(system);
    pfHandler = new PageFaultHandler(system);
    pendingFault = null;
    dom.mmuLog.innerHTML = `Sistema inicializado para a Parte ${part}.`;
    renderAll();
  },

  selectProcess: (pid) => {
    activePid = pid;
    renderControls();
    dom.mmuLog.innerHTML = `Processo P${pid} selecionado.`;
  },

  accessVariable: (pid, pageNum) => {
    if (pid !== activePid) {
      dom.mmuLog.innerHTML = `Processo P${pid} não está ativo. Selecione-o primeiro.`;
      return;
    }
    if (pendingFault) {
      dom.mmuLog.innerHTML += `\n\n[ERRO] Resolva o Page Fault pendente antes de continuar.`;
      return;
    }

    const result = mmu.access(pid, pageNum);
    dom.mmuLog.innerHTML = result.log;

    if (result.status === "HIT") {
      blinkFrame(result.frame);
    } else if (result.status === "FAULT") {
      pendingFault = { pid, pageNum, type: result.faultType };
      showModal();
    }
  },

  selectModalFrame: (frameNum) => {
    if (!pendingFault) return;

    const result = pfHandler.resolve(
      pendingFault.pid,
      pendingFault.pageNum,
      frameNum,
    );
    dom.mmuLog.innerHTML += result.log;

    if (result.success) {
      hideModal();
      renderAll();
      blinkFrame(result.frame);
    }
  },

  cancelModal: () => {
    hideModal();
    dom.mmuLog.innerHTML += `\n\n--- [SO] Resolução de Page Fault cancelada. ---`;
  },
};

// --- Inicialização do App ---

// Expõe o 'app' globalmente para que o HTML (onclick) possa chamá-lo
window.app = app;

// Carga inicial
window.onload = () => {
  app.switchPart(1); // Inicia na Parte 1
};
