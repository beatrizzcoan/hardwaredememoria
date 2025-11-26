/**
 * simulation.js
 * Contém a lógica "backend" do simulador: constantes, estado da memória
 * e a MMU (Memory Management Unit).
 */

export const CONSTANTS = {
  PROCESSES_COUNT: 4,     // 4 Processos para garantir que a RAM lote!
  PAGES_PER_PROCESS: 4,   // 4 * 4 = 16 páginas totais
  RAM_FRAMES: 16,         // 16 quadros totais
  SWAP_FRAMES: 32,        // Espaço em disco
  FRAME_KERNEL: 0,        // Reservado
  FRAME_TABLES: 1,        // Reservado
  USER_RAM_START: 2       // 16 - 2 = 14 quadros livres para usuário. (16 páginas > 14 quadros -> SWAP!)
};

export class SystemState {
  constructor(part) {
    this.part = parseInt(part);
    this.ram_state = [];
    this.swap_state = [];
    this.page_tables = []; 

    this.initRAM();
    this.initSwap();
    this.initPageTables();
  }

  initRAM() {
    for (let i = 0; i < CONSTANTS.RAM_FRAMES; i++) {
      // pid -1 significa Sistema, 0 significa Livre
      let owner = 0;
      if (i === CONSTANTS.FRAME_KERNEL || i === CONSTANTS.FRAME_TABLES) {
        owner = -1; 
      }
      this.ram_state.push({ owner_pid: owner, owner_page: -1 });
    }
  }

  initSwap() {
    for (let i = 0; i < CONSTANTS.SWAP_FRAMES; i++) {
      this.swap_state.push({ owner_pid: 0, owner_page: -1 });
    }
  }

  initPageTables() {
    // Cria tabelas dinamicamente para quantos processos existirem (1 até PROCESSES_COUNT)
    for (let p = 1; p <= CONSTANTS.PROCESSES_COUNT; p++) {
      const table = new Map();
      for (let page = 0; page < CONSTANTS.PAGES_PER_PROCESS; page++) {
        // Inicialmente: valid=false, frame=-1
        table.set(page, { valid: false, frame: -1, onSwap: false, swapBlock: -1 });
      }
      this.page_tables.push(table);
    }
  }

  // Retorna a tabela do processo (ajusta índice base-0)
  getPageTable(pid) {
    return this.page_tables[pid - 1];
  }
}

export class MMU {
  constructor(system) {
    this.system = system;
  }

  access(pid, pageNum) {
    const pt = this.system.getPageTable(pid);
    const entry = pt.get(pageNum);
    let log = `> Acesso: P${pid}, Página ${pageNum}\n`;

    // Parte 1: Apenas Tradução Simples (Simulada dinamicamente)
    if (this.system.part === 1) {
      // Usa uma fórmula matemática simples para simular mapeamento sem precisar de tabelas manuais
      const fakeFrame = (pid * 2 + pageNum) % CONSTANTS.RAM_FRAMES;
      log += `  Modo: Tradução Simples\n`;
      log += `  VPN (Página Virtual): ${pageNum} -> PFN (Quadro Físico): ${fakeFrame}\n`;
      log += `  [OK] Acesso concedido ao endereço físico.\n`;
      return { status: "HIT", frame: fakeFrame, log };
    }

    // Parte 2: Paginação sob Demanda
    if (entry.valid) {
      log += `  [HIT] Página está na RAM (Quadro ${entry.frame}).\n`;
      log += `  Tradução: Endereço Virtual ${pid}:${pageNum} -> Físico ${entry.frame}\n`;
      return { status: "HIT", frame: entry.frame, log };
    } else {
      log += `  [MISS] Página NÃO está na RAM (Bit de Validade = 0).\n`;
      log += `  Gerando interrupção de PAGE FAULT...\n`;
      return { status: "FAULT", faultType: entry.onSwap ? "SWAP_IN" : "COLD_START", log };
    }
  }
}

export class PageFaultHandler {
  constructor(system) {
    this.system = system;
  }

  // Chamado quando o usuário escolhe um quadro no Modal
  resolve(pid, pageNum, targetFrame) {
    const pt = this.system.getPageTable(pid);
    const entry = pt.get(pageNum);
    const frameObj = this.system.ram_state[targetFrame];
    let log = `> Resolvendo Page Fault para P${pid}-Pág${pageNum} no Quadro ${targetFrame}...\n`;

    // 1. Se o quadro escolhido está ocupado, faz SWAP-OUT (Vítima)
    if (frameObj.owner_pid > 0) {
      const victimPid = frameObj.owner_pid;
      const victimPage = frameObj.owner_page;
      log += `  ! Conflito: Quadro ocupado por P${victimPid}-Pág${victimPage}.\n`;
      
      // Encontrar espaço no Swap
      const swapBlockIndex = this.system.swap_state.findIndex(b => b.owner_pid === 0);
      if (swapBlockIndex === -1) {
        return { success: false, log: log + "  [ERRO CRÍTICO] Swap cheio! Kernel Panic.\n" };
      }

      // Mover vítima para Swap
      this.system.swap_state[swapBlockIndex] = { owner_pid: victimPid, owner_page: victimPage };
      
      // Atualizar tabela da vítima
      const victimPT = this.system.getPageTable(victimPid);
      const victimEntry = victimPT.get(victimPage);
      victimEntry.valid = false;
      victimEntry.frame = -1;
      victimEntry.onSwap = true;
      victimEntry.swapBlock = swapBlockIndex;
      
      log += `  -> Vítima movida para Swap (Bloco ${CONSTANTS.RAM_FRAMES + swapBlockIndex}).\n`;
    }

    // 2. Traz a página solicitada (SWAP-IN ou ZERO-FILL)
    // Se estava no swap, libera o bloco de swap
    if (entry.onSwap) {
        log += `  -> Trazendo do Swap (Bloco ${CONSTANTS.RAM_FRAMES + entry.swapBlock}).\n`;
        this.system.swap_state[entry.swapBlock] = { owner_pid: 0, owner_page: -1 };
        entry.onSwap = false;
        entry.swapBlock = -1;
    }

    // 3. Atualiza RAM
    this.system.ram_state[targetFrame] = { owner_pid: pid, owner_page: pageNum };
    
    // 4. Atualiza Tabela do Processo Solicitante
    entry.valid = true;
    entry.frame = targetFrame;

    log += `  [SUCESSO] Página mapeada no Quadro ${targetFrame}.\n`;
    return { success: true, frame: targetFrame, log };
  }
}