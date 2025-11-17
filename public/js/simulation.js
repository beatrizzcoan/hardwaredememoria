/**
 * simulation.js
 * Contém toda a lógica pura do simulador (as "classes").
 * Não sabe nada sobre o HTML/DOM.
 */

export const CONSTANTS = {
  PAGE_SIZE: 1024,
  RAM_FRAMES: 16,
  PROCESSES_COUNT: 3,
  PAGES_PER_PROCESS: 4,
  SWAP_FRAMES: 8,
  FRAME_TABLES: 0,
  FRAME_KERNEL: 1,
  USER_RAM_START: 2,
  PTBR_P1: 0x00,
  PTBR_P2: 0x10,
  PTBR_P3: 0x20,
};

/**
 * Representa um Processo (TCB).
 */
class Process {
  constructor(pid, ptbr_offset) {
    this.pid = pid;
    // Para Parte 1
    this.ptbr_offset = ptbr_offset;
    // Para Parte 2
    this.page_table = Array(CONSTANTS.PAGES_PER_PROCESS)
      .fill(null)
      .map(() => ({ state: "INV", location: -1 }));
  }
}

/**
 * Gerencia o estado de todo o sistema.
 */
export class SystemState {
  constructor(part) {
    this.part = parseInt(part);
    this.ram_state = Array(CONSTANTS.RAM_FRAMES)
      .fill(null)
      .map(() => ({ owner_pid: 0, owner_page: -1 }));
    this.swap_state = Array(CONSTANTS.SWAP_FRAMES)
      .fill(null)
      .map(() => ({ owner_pid: 0, owner_page: -1 }));
    this.processes = [];
    this.ramFrame0 = {}; // Simula a memória do Quadro 0 para a Parte 1

    if (this.part === 1) {
      this._initializePart1();
    } else {
      this._initializePart2();
    }
  }

  _initializePart1() {
    // 1. Criar TCBs
    this.processes = [
      new Process(1, CONSTANTS.PTBR_P1),
      new Process(2, CONSTANTS.PTBR_P2),
      new Process(3, CONSTANTS.PTBR_P3),
    ];

    // 2. Preencher Quadro 0
    this.ram_state[CONSTANTS.FRAME_TABLES] = { owner_pid: -1, owner_page: -1 };

    // P1: 5, 8, 9, 11
    this.ramFrame0[CONSTANTS.PTBR_P1 + 0] = 5;
    this.ramFrame0[CONSTANTS.PTBR_P1 + 1] = 8;
    this.ramFrame0[CONSTANTS.PTBR_P1 + 2] = 9;
    this.ramFrame0[CONSTANTS.PTBR_P1 + 3] = 11;
    // P2: 1, 2, 12, 13
    this.ramFrame0[CONSTANTS.PTBR_P2 + 0] = 1;
    this.ramFrame0[CONSTANTS.PTBR_P2 + 1] = 2;
    this.ramFrame0[CONSTANTS.PTBR_P2 + 2] = 12;
    this.ramFrame0[CONSTANTS.PTBR_P2 + 3] = 13;
    // P3: 3, 4, 14, 15
    this.ramFrame0[CONSTANTS.PTBR_P3 + 0] = 3;
    this.ramFrame0[CONSTANTS.PTBR_P3 + 1] = 4;
    this.ramFrame0[CONSTANTS.PTBR_P3 + 2] = 14;
    this.ramFrame0[CONSTANTS.PTBR_P3 + 3] = 15;

    // 3. Atualizar estado visual da RAM
    this.ram_state[5] = { owner_pid: 1, owner_page: 0 };
    this.ram_state[8] = { owner_pid: 1, owner_page: 1 };
    this.ram_state[9] = { owner_pid: 1, owner_page: 2 };
    this.ram_state[11] = { owner_pid: 1, owner_page: 3 };
    this.ram_state[1] = { owner_pid: 2, owner_page: 0 };
    this.ram_state[2] = { owner_pid: 2, owner_page: 1 };
    this.ram_state[12] = { owner_pid: 2, owner_page: 2 };
    this.ram_state[13] = { owner_pid: 2, owner_page: 3 };
    this.ram_state[3] = { owner_pid: 3, owner_page: 0 };
    this.ram_state[4] = { owner_pid: 3, owner_page: 1 };
    this.ram_state[14] = { owner_pid: 3, owner_page: 2 };
    this.ram_state[15] = { owner_pid: 3, owner_page: 3 };
  }

  _initializePart2() {
    // 1. Reservar quadros do sistema
    this.ram_state[CONSTANTS.FRAME_TABLES] = { owner_pid: -1, owner_page: -1 };
    this.ram_state[CONSTANTS.FRAME_KERNEL] = { owner_pid: -1, owner_page: -1 };

    // 2. Criar TCBs (com page tables 'INV')
    this.processes = [new Process(1), new Process(2), new Process(3)];
  }

  getProcess(pid) {
    return this.processes.find((p) => p.pid === pid);
  }

  findFreeSwapSlot() {
    return this.swap_state.findIndex((slot) => slot.owner_pid === 0);
  }
}

/**
 * Simula a MMU.
 */
export class MMU {
  constructor(systemState) {
    this.system = systemState;
  }

  /**
   * Tenta acessar um endereço.
   * Retorna um objeto com o resultado.
   */
  access(pid, pageNum) {
    const offset = Math.floor(Math.random() * 1023);
    const logicalAddress = pageNum * CONSTANTS.PAGE_SIZE + offset;
    const process = this.system.getProcess(pid);

    let log = `--- [MMU] Acesso P${pid} ---\n`;
    log += `1. Endereço Lógico: 0x${logicalAddress.toString(16).padStart(4, "0")}\n`;
    log += `   - Página (P): ${pageNum}\n`;
    log += `   - Offset (D): ${offset} (0x${offset.toString(16).padStart(3, "0")})\n\n`;

    if (this.system.part === 1) {
      return this._accessPart1(process, pageNum, offset, log);
    } else {
      return this._accessPart2(process, pageNum, offset, log);
    }
  }

  _accessPart1(process, pageNum, offset, log) {
    log += `2. Acessando Tabela de Páginas (Quadro 0)...\n`;
    const ptbr = process.ptbr_offset;
    log += `   - PTBR (P${process.pid}): 0x${ptbr.toString(16).padStart(4, "0")}\n`;

    const entry_key = ptbr + pageNum;
    const frame_num = this.system.ramFrame0[entry_key];
    log += `   - Lendo entrada da Pág ${pageNum}...\n`;
    log += `   - Quadro Físico encontrado: ${frame_num}\n\n`;

    log += `3. Cálculo do Endereço Físico:\n`;
    const physicalAddress = frame_num * CONSTANTS.PAGE_SIZE + offset;
    log += `   - (${frame_num} * ${CONSTANTS.PAGE_SIZE}) + ${offset}\n`;
    log += `   - Endereço Físico Final: 0x${physicalAddress.toString(16).padStart(4, "0")}\n\n`;
    log += `4. Acesso ao dado no Quadro ${frame_num}.\n`;

    return { log, status: "HIT", frame: frame_num };
  }

  _accessPart2(process, pageNum, offset, log) {
    log += `2. Acessando Tabela de Páginas do P${process.pid}...\n`;
    const pte = process.page_table[pageNum];

    switch (pte.state) {
      case "RAM": {
        const frame_num = pte.location;
        log += `   - Estado: RAM\n`;
        log += `   - Localização: Quadro ${frame_num}\n\n`;
        const physicalAddress = frame_num * CONSTANTS.PAGE_SIZE + offset;
        log += `3. Cálculo do Endereço Físico:\n`;
        log += `   - (${frame_num} * ${CONSTANTS.PAGE_SIZE}) + ${offset}\n`;
        log += `   - Endereço Físico Final: 0x${physicalAddress.toString(16).padStart(4, "0")}\n\n`;
        log += `4. Acesso ao dado no Quadro ${frame_num}.\n`;

        return { log, status: "HIT", frame: frame_num };
      }
      case "INV":
        log += `   - Estado: INV (Inválida)\n`;
        log += `   - Localização: -1\n\n`;
        log += `*** EVENTO: Page Fault (Página Inválida) ***\n`;
        log += `O SO deve alocar P${process.pid}, Pág ${pageNum} em um quadro.`;

        return { log, status: "FAULT", faultType: "INV" };

      case "SWAP": {
        const block_num = pte.location;
        log += `   - Estado: SWAP\n`;
        log += `   - Localização: Bloco ${block_num}\n\n`;
        log += `*** EVENTO: Page Fault (Página em Swap) ***\n`;
        log += `O SO deve trazer P${process.pid}, Pág ${pageNum} do Bloco ${block_num} para a RAM.`;

        return { log, status: "FAULT", faultType: "SWAP" };
      }
    }
  }
}

/**
 * Simula o "Sistema Operacional" tratando o Page Fault.
 */
export class PageFaultHandler {
  constructor(systemState) {
    this.system = systemState;
  }

  resolve(pid, pageNum, chosenFrame) {
    let log = `\n\n--- [SO] Resolvendo Page Fault ---\n`;

    // 1. Validar o quadro
    if (
      chosenFrame < CONSTANTS.USER_RAM_START ||
      chosenFrame >= CONSTANTS.RAM_FRAMES
    ) {
      log += `   - ERRO: Quadro ${chosenFrame} é inválido!\n`;
      if (chosenFrame == CONSTANTS.FRAME_KERNEL) {
        log += `   - *** VIOLAÇÃO DE PROTEÇÃO - ÁREA DO KERNEL ***`;
      }
      return { log, success: false };
    }

    const process = this.system.getProcess(pid);
    const pte_new = process.page_table[pageNum];
    const frame_to_use = this.system.ram_state[chosenFrame];

    // 2. Verificar se o quadro está ocupado (Swap-Out)
    if (frame_to_use.owner_pid > 0) {
      log += `   - Quadro ${chosenFrame} está ocupado por (P${frame_to_use.owner_pid}, Pág ${frame_to_use.owner_page}).\n`;

      const swapSlot = this.system.findFreeSwapSlot(); // Retorna índice 0-7
      if (swapSlot === -1) {
        log += `   - ERRO: Área de Swap está cheia! Abortando.\n`;
        return { log, success: false };
      }

      const swapBlockNum = swapSlot + CONSTANTS.RAM_FRAMES; // Bloco 16-23
      log += `   - Movendo (P${frame_to_use.owner_pid}, Pág ${frame_to_use.owner_page}) para o Bloco ${swapBlockNum} (Swap-Out).\n`;

      // Atualiza a tabela do processo "vítima"
      const victim_process = this.system.getProcess(frame_to_use.owner_pid);
      victim_process.page_table[frame_to_use.owner_page].state = "SWAP";
      victim_process.page_table[frame_to_use.owner_page].location =
        swapBlockNum;

      // Atualiza o estado do swap
      this.system.swap_state[swapSlot] = {
        owner_pid: frame_to_use.owner_pid,
        owner_page: frame_to_use.owner_page,
      };
    }

    // 3. Trazer a nova página para a RAM (Alocação / Swap-In)
    if (pte_new.state === "SWAP") {
      const oldBlockNum = pte_new.location;
      log += `   - Trazendo (P${pid}, Pág ${pageNum}) do Bloco ${oldBlockNum} para o Quadro ${chosenFrame} (Swap-In).\n`;
      // Limpa o bloco de swap antigo (índice 0-7)
      this.system.swap_state[oldBlockNum - CONSTANTS.RAM_FRAMES] = {
        owner_pid: 0,
        owner_page: -1,
      };
    } else {
      log += `   - Alocando (P${pid}, Pág ${pageNum}) no Quadro ${chosenFrame}.\n`;
    }

    // Atualiza o estado da RAM
    this.system.ram_state[chosenFrame] = {
      owner_pid: pid,
      owner_page: pageNum,
    };

    // Atualiza a tabela do processo atual
    pte_new.state = "RAM";
    pte_new.location = chosenFrame;

    log += `   - Page Fault Resolvido!`;
    return { log, success: true, frame: chosenFrame };
  }
}
