/**
 * main.js
 * Conecta a UI (HTML) com a Lógica (simulation.js).
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

// --- Funções de Renderização ---

function renderAll() {
  renderControls();
  renderRam();
  renderSwap();
}

function renderControls() {
  // Percorre até o número total de processos definido nas constantes (4)
  for (let i = 1; i <= CONSTANTS.PROCESSES_COUNT; i++) {
    const div = document.getElementById(`p-${i}`);
    const vars = document.getElementById(`p-${i}-vars`);
    
    // Se o elemento não existir no HTML (caso esqueça de atualizar), ignora
    if (!div) continue;

    if (i === activePid) {
      div.classList.add("active");
      vars.classList.remove("hidden");
    } else {
      div.classList.remove("active");
      vars.classList.add("hidden");
    }
  }
  
  // Mostra painel de swap apenas na Parte 2
  if (system.part === 2) {
    dom.swapPanel.classList.remove("hidden");
  } else {
    dom.swapPanel.classList.add("hidden");
  }
}

function renderRam() {
  dom.ramContainer.innerHTML = "";
  for (let i = 0; i < CONSTANTS.RAM_FRAMES; i++) {
    const frame = system.ram_state[i];
    let content = `<span class="opacity-50">Livre</span>`;
    let colorClass = "p-color-free";

    if (frame.owner_pid === -1) {
      content = i === CONSTANTS.FRAME_TABLES ? "Pg Tables" : "Kernel";
      colorClass = "p-color-system";
    } else if (frame.owner_pid > 0) {
      content = `P${frame.owner_pid} <br> <span class="text-[10px]">Pág ${frame.owner_page}</span>`;
      colorClass = `p-color-${frame.owner_pid}`;
    }

    dom.ramContainer.innerHTML += `
            <div id="ram-frame-${i}" class="frame-item ${colorClass}">
                <span class="font-bold text-[10px] uppercase mb-1">Q${i}</span>
                <div class="leading-tight">${content}</div>
            </div>
        `;
  }
}

function renderSwap() {
  dom.swapContainer.innerHTML = "";
  for (let i = 0; i < CONSTANTS.SWAP_FRAMES; i++) {
    const block = system.swap_state[i];
    let content = "-";
    let colorClass = "p-color-free";

    if (block.owner_pid > 0) {
      content = `P${block.owner_pid}<br>Pg ${block.owner_page}`;
      colorClass = `p-color-${block.owner_pid}`;
    }

    dom.swapContainer.innerHTML += `
            <div class="frame-item ${colorClass}">
                <span class="font-bold text-[10px] text-gray-500">B${i}</span>
                <div class="leading-tight text-xs">${content}</div>
            </div>
        `;
  }
}

function blinkFrame(frameNum) {
  const frameEl = document.getElementById(`ram-frame-${frameNum}`);
  if (frameEl) {
    // Remove e adiciona classe para reiniciar animação
    frameEl.classList.remove("frame-blink");
    void frameEl.offsetWidth; // Trigger reflow
    frameEl.classList.add("frame-blink");
  }
}

// --- Lógica do Modal de Page Fault ---

function showModal() {
  if (!pendingFault) return;

  dom.modalPrompt.textContent = `P${pendingFault.pid} precisa carregar a Pág ${pendingFault.pageNum}. Escolha um Quadro Físico:`;
  dom.modalFrames.innerHTML = ""; 

  let hasFreeFrames = false;
  
  // 1. Verifica frames livres (a partir da área de usuário)
  for (let i = CONSTANTS.USER_RAM_START; i < CONSTANTS.RAM_FRAMES; i++) {
    if (system.ram_state[i].owner_pid === 0) {
      hasFreeFrames = true;
      dom.modalFrames.innerHTML += createFrameButton(i, "Livre", "bg-green-100 text-green-800 border-green-300");
    }
  }

  // 2. Se RAM cheia, lista todos ocupados para substituição (Swap-out)
  if (!hasFreeFrames) {
    dom.modalPrompt.innerHTML = `
        <span class="text-red-600 font-bold">RAM CHEIA!</span> 
        Escolha uma vítima para sofrer <span class="font-mono bg-gray-200 px-1">Swap-Out</span>:
    `;
    for (let i = CONSTANTS.USER_RAM_START; i < CONSTANTS.RAM_FRAMES; i++) {
      const frame = system.ram_state[i];
      dom.modalFrames.innerHTML += createFrameButton(
          i, 
          `P${frame.owner_pid}-Pg${frame.owner_page}`, 
          `p-color-${frame.owner_pid} hover:opacity-75`
      );
    }
  }

  dom.modalContainer.classList.remove("hidden");
}

function createFrameButton(index, text, classes) {
    return `<button onclick="window.app.selectModalFrame(${index})" 
             class="border p-2 rounded text-sm font-semibold transition-transform hover:scale-105 ${classes}">
             Q${index}<br>${text}
            </button>`;
}

function hideModal() {
  dom.modalContainer.classList.add("hidden");
  pendingFault = null;
}

// --- App Controller (Exportado para Window) ---

const app = {
  switchPart: (part) => {
    system = new SystemState(part);
    mmu = new MMU(system);
    pfHandler = new PageFaultHandler(system);
    pendingFault = null;
    
    // Log inicial
    dom.mmuLog.textContent = `> Sistema reiniciado.\n> Modo: ${part == 1 ? "Tradução Simples" : "Paginação sob Demanda"}.\n> 4 Processos carregados.\n> RAM: ${CONSTANTS.RAM_FRAMES} Quadros.\n`;
    
    renderAll();
  },

  selectProcess: (pid) => {
    activePid = pid;
    renderControls();
    dom.mmuLog.textContent += `\n> Contexto alterado para Processo ${pid}.`;
    // Rola o log para o final
    dom.mmuLog.scrollTop = dom.mmuLog.scrollHeight;
  },

  accessVariable: (pid, pageNum) => {
    if (pid !== activePid) {
      alert(`O Processo ${pid} não está na CPU. Selecione-o no painel esquerdo.`);
      return;
    }
    
    // Bloqueia se houver falha pendente
    if (pendingFault) {
      alert("Resolva o Page Fault pendente antes de continuar.");
      return;
    }

    const result = mmu.access(pid, pageNum);
    dom.mmuLog.textContent += "\n" + result.log;
    dom.mmuLog.scrollTop = dom.mmuLog.scrollHeight;

    if (result.status === "HIT") {
      // Sucesso visual
      blinkFrame(result.frame);
    } else if (result.status === "FAULT") {
      // Abre modal para resolver
      pendingFault = { pid, pageNum, type: result.faultType };
      showModal();
    }
  },

  selectModalFrame: (frameNum) => {
    if (!pendingFault) return;

    // Resolve a falha (Swap in/out se necessário)
    const result = pfHandler.resolve(
      pendingFault.pid,
      pendingFault.pageNum,
      frameNum
    );
    
    dom.mmuLog.textContent += result.log;
    dom.mmuLog.scrollTop = dom.mmuLog.scrollHeight;

    if (result.success) {
      hideModal();
      renderAll();
      blinkFrame(result.frame);
    }
  },

  cancelModal: () => {
    hideModal();
    dom.mmuLog.textContent += `\n> [ABORT] Operação cancelada pelo usuário.\n`;
    dom.mmuLog.scrollTop = dom.mmuLog.scrollHeight;
  }
};

// --- Boot ---
window.app = app;
window.onload = () => {
  app.switchPart(1);
};