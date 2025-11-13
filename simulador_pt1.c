#include <stdio.h>
#include <stdlib.h>
#include <string.h> // Para memset
#include <locale.h> // Para acentuação

// --- Parâmetros do Sistema ---

// 1 KiB (1024 bytes) por página/frame
#define TAMANHO_PAGINA 1024
// 16 KiB de RAM (16 frames)
#define QUADROS_RAM 16
#define TAMANHO_RAM (QUADROS_RAM * TAMANHO_PAGINA)
// 4 páginas por processo
#define PAGINAS_PROCESSO 4
#define PROCESSOS_COUNT 3

// Máscara para extrair o offset (10 bits, 0x03FF)
// 1024 = 2^10, logo 10 bits para offset
#define MASCARA_OFFSET 0x03FF

// --- Estruturas de Dados ---

/**
 * @brief Simula o TCB (Task Control Block) de um processo.
 * Guarda o offset da tabela de páginas (PTBR) dentro do Frame 0.
 */
typedef struct {
    int pid;
    int ptbr_offset; // Endereço base da tabela de páginas no Frame 0
} TCB;

// --- Variáveis Globais (Simulação de Hardware) ---

// 1. Simulação da Memória Física (RAM)
unsigned char RAM[TAMANHO_RAM];

// 2. Simulação dos TCBs (Processos)
TCB processos[PROCESSOS_COUNT];

// 3. Array auxiliar para visualização da RAM
// Guarda quem "ocupa" cada frame (0=Livre/Sistema, 1=P1, 2=P2, 3=P3)
int dono_frame[QUADROS_RAM];

/**
 * @brief Configura o estado inicial do sistema.
 * Preenche o Frame 0 com as tabelas de páginas.
 */
void inicializar_sistema() {
    // Limpa a RAM (opcional, mas boa prática)
    memset(RAM, 0, sizeof(RAM));
    memset(dono_frame, 0, sizeof(dono_frame)); // 0 = Livre

    printf("Inicializando sistema...\n");

    // --- 1. Configurar TCBs (PTBR) ---
    processos[0].pid = 1;
    processos[0].ptbr_offset = 0x0000; // P1

    processos[1].pid = 2;
    processos[1].ptbr_offset = 0x0100; // P2

    processos[2].pid = 3;
    processos[2].ptbr_offset = 0x0200; // P3

    // --- 2. Preencher Frame 0 (Tabelas de Páginas) ---
    // Assumimos que cada entrada da tabela ocupa 1 byte (pois os frames são < 255)

    // Tabela P1 (Inicia em 0x0000)
    RAM[0x0000 + 0] = 5;  // Pág 0 -> Frame 5
    RAM[0x0000 + 1] = 8;  // Pág 1 -> Frame 8
    RAM[0x0000 + 2] = 9;  // Pág 2 -> Frame 9
    RAM[0x0000 + 3] = 11; // Pág 3 -> Frame 11

    // Tabela P2 (Inicia em 0x0100)
    RAM[0x0100 + 0] = 1;  // Pág 0 -> Frame 1
    RAM[0x0100 + 1] = 2;  // Pág 1 -> Frame 2
    RAM[0x0100 + 2] = 12; // Pág 2 -> Frame 12
    RAM[0x0100 + 3] = 13; // Pág 3 -> Frame 13

    // Tabela P3 (Inicia em 0x0200)
    RAM[0x0200 + 0] = 3;  // Pág 0 -> Frame 3
    RAM[0x0200 + 1] = 4;  // Pág 1 -> Frame 4
    RAM[0x0200 + 2] = 14; // Pág 2 -> Frame 14
    RAM[0x0200 + 3] = 15; // Pág 3 -> Frame 15

    // --- 3. Configurar Donos dos Frames (para visualização) ---
    dono_frame[0] = -1; // -1 = Tabela de Páginas

    // P1
    dono_frame[5] = 1; dono_frame[8] = 1; dono_frame[9] = 1; dono_frame[11] = 1;
    // P2
    dono_frame[1] = 2; dono_frame[2] = 2; dono_frame[12] = 2; dono_frame[13] = 2;
    // P3
    dono_frame[3] = 3; dono_frame[4] = 3; dono_frame[14] = 3; dono_frame[15] = 3;
    // Frames 6, 7, 10 estão livres

    printf("Sistema pronto. Tabelas de páginas carregadas no Frame 0.\n");
}

/**
 * @brief Simula o "Painel Direito"
 * Exibe o estado da RAM, destacando o frame acedido.
 * @param frame_acessado O frame a destacar (ou -1 para nenhum).
 */
void exibir_ram(int frame_acessado) {
    printf("--- Visualizacao da RAM (16 KiB) ---\n");
    for (int i = 0; i < QUADROS_RAM; i++) {
        // Endereço inicial do frame (ex: 0x0000, 0x0400, ...)
        int end_inicial = i * TAMANHO_PAGINA;

        printf("Frame %2d (0x%04X): ", i, end_inicial);

        // Mostra o dono do frame (colorido por processo)
        switch(dono_frame[i]) {
            case -1: printf("[ TABELA PAGINAS ]"); break;
            case 1:  printf("[      P1      ]"); break;
            case 2:  printf("[      P2      ]"); break;
            case 3:  printf("[      P3      ]"); break;
            default: printf("[     LIVRE      ]");
        }

        // Simula o "piscar" do frame acedido
        if (i == frame_acessado) {
            printf(" <--- ACESSO!");
        }
        printf("\n");
    }
}

/**
 * @brief Simula o "Painel Central" (MMU)
 * Realiza a tradução de endereço lógico para físico.
 * @param processo_ativo O TCB do processo atual.
 * @param endereco_logico O endereço virtual a ser traduzido.
 */
void mmu_traduzir_endereco(TCB processo_ativo, int endereco_logico) {
    printf("\n============================================\n");
    printf("### Painel Central: Simulacao da MMU ###\n");
    printf("Processo Ativo: P%d\n", processo_ativo.pid);
    printf("============================================\n");

    // 1. Decomposição do endereço lógico
    // 1KiB = 1024 bytes = 2^10. Precisamos de 10 bits para o offset (D).
    // O espaço de endereçamento é 4KiB (2^12), 4 páginas.
    // Endereço Lógico (12 bits): PP D (2 bits Pagina, 10 bits Offset)

    int offset = endereco_logico & MASCARA_OFFSET;
    // (endereco_logico >> 10) isola os bits da página
    int num_pagina = (endereco_logico >> 10);

    printf("1. Endereco Logico: 0x%04X (Decimal: %d)\n", endereco_logico, endereco_logico);
    printf("   -> Pagina (P): %d\n", num_pagina);
    printf("   -> Offset (D): %d (0x%03X)\n", offset, offset);

    // 2. Consulta à tabela de páginas
    printf("\n2. Consultando Tabela de Paginas (no Frame 0)...\n");
    // Simula o primeiro acesso à RAM (Frame 0)
    exibir_ram(0);

    int ptbr = processo_ativo.ptbr_offset;
    // Endereço *dentro do Frame 0* onde está a entrada da página
    int endereco_entrada_tabela = ptbr + num_pagina;

    // Lê o valor da RAM (Frame 0) para encontrar o frame físico
    // (int) converte o byte lido para o número do frame
    int num_frame = (int)RAM[endereco_entrada_tabela];

    printf("\n   -> PTBR (Offset Tabela P%d): 0x%04X\n", processo_ativo.pid, ptbr);
    printf("   -> Endereco da Entrada (Frame 0 + PTBR + P): 0x%04X + %d = 0x%04X\n", ptbr, num_pagina, endereco_entrada_tabela);
    printf("   -> Valor lido da Tabela (RAM[0x%04X]): %d\n", endereco_entrada_tabela, num_frame);

    // 3. Quadro Físico Correspondente
    printf("\n3. Quadro Fisico (F) encontrado: %d\n", num_frame);

    // 4. Cálculo do Endereço Físico Final
    int endereco_fisico = (num_frame * TAMANHO_PAGINA) + offset;
    printf("\n4. Calculo Endereco Fisico (F * %d + D):\n", TAMANHO_PAGINA);
    printf("   -> (%d * %d) + %d = %d\n", num_frame, TAMANHO_PAGINA, offset, endereco_fisico);
    printf("   -> Endereco Fisico Final: 0x%04X (Decimal: %d)\n", endereco_fisico, endereco_fisico);

    // 5. Visualização do Acesso final à RAM
    printf("\n5. Acessando RAM no Endereco Fisico...\n");
    exibir_ram(num_frame); // Mostra acesso ao frame de dados
}


// --- Função Principal (Interface do Simulador) ---

int main() {
    // Permite usar acentuação no terminal (ex: "Endereço")
    setlocale(LC_ALL, "Portuguese");

    inicializar_sistema();

    int pid_ativo = 1;
    TCB processo_ativo = processos[pid_ativo - 1]; // Inicia com P1

    // Endereços lógicos fixos para as 4 variáveis (uma por página)
    // Usamos offsets diferentes para provar que funciona
    int enderecos_logicos[4];
    enderecos_logicos[0] = 0 * 1024 + 100; // Pag 0, Offset 100 (End. Logico: 100)
    enderecos_logicos[1] = 1 * 1024 + 200; // Pag 1, Offset 200 (End. Logico: 1224)
    enderecos_logicos[2] = 2 * 1024 + 50;  // Pag 2, Offset 50  (End. Logico: 2098)
    enderecos_logicos[3] = 3 * 1024 + 300; // Pag 3, Offset 300 (End. Logico: 3372)

    int escolha_menu, escolha_var, novo_pid;

    while (1) {
        printf("\n\n============================================\n");
        printf("   JOGO SIMULADOR DE HARDWARE DE PAGINACAO\n");
        printf("                (PARTE 1) \n");
        printf("============================================\n");

        // Simulação do Painel Esquerdo
        printf("--- Painel Esquerdo: Processos ---\n");
        printf("Processo Ativo: P%d\n", pid_ativo);
        printf("  TCB P1 (PTBR: 0x%04X)\n", processos[0].ptbr_offset);
        printf("  TCB P2 (PTBR: 0x%04X)\n", processos[1].ptbr_offset);
        printf("  TCB P3 (PTBR: 0x%04X)\n", processos[2].ptbr_offset);

        printf("\n--- Acoes ---\n");
        printf("1. Mudar Processo Ativo (Simula clique no processo)\n");
        printf("2. Acessar Variavel (Simula clique na variavel)\n");
        printf("3. Visualizar RAM Atual\n");
        printf("0. Sair\n");
        printf("Escolha: ");

        if (scanf("%d", &escolha_menu) != 1) {
            // Limpa o buffer de entrada se o utilizador digitar algo não numérico
            while(getchar() != '\n');
            printf("Erro: Entrada invalida. Tente novamente.\n");
            continue;
        }

        switch (escolha_menu) {
            case 1: // Mudar Processo
                printf("Mudar para qual processo (1, 2 ou 3)? ");
                scanf("%d", &novo_pid);
                if (novo_pid < 1 || novo_pid > 3) {
                    printf("Processo invalido. Mantendo P%d.\n", pid_ativo);
                } else {
                    pid_ativo = novo_pid;
                    processo_ativo = processos[pid_ativo - 1];
                    printf("Processo ativo atualizado para P%d.\n", pid_ativo);
                }
                break;

            case 2: // Acessar Variável
                printf("Acessar qual variavel (pagina 0, 1, 2 ou 3)? ");
                scanf("%d", &escolha_var);
                if (escolha_var < 0 || escolha_var > 3) {
                    printf("Variavel/Pagina invalida.\n");
                } else {
                    int end_logico_selecionado = enderecos_logicos[escolha_var];
                    // Chama a MMU (Painel Central)
                    mmu_traduzir_endereco(processo_ativo, end_logico_selecionado);
                }
                break;

            case 3: // Visualizar RAM
                exibir_ram(-1); // Exibe RAM sem acesso
                break;

            case 0: // Sair
                printf("Simulador terminado.\n");
                return 0;

            default:
                printf("Opcao invalida.\n");
                break;
        }
    }

    return 0;
}