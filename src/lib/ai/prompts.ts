import type { BrandContext } from "../admin-settings";

/** Contexto de sistema injetado em cada prompt de copy. */
export function systemPrompt(brand: BrandContext, consultant?: {
  name?: string; phone?: string; city?: string; instagram?: string;
}): string {
  const parts = [
    `Você é um copywriter especialista em vendas para a marca ${brand.company}.`,
    `Produto: ${brand.product}. Valores da marca: ${brand.values}. Tom: ${brand.tone}.`,
    `CTA padrão: "${brand.cta_default}".`,
    `Escreva em português brasileiro, direto, sem enrolação, sem clichês corporativos.`,
    `Use frases curtas. Foque em benefício claro. Não invente serviços que a LOOG não oferece.`,
  ];
  if (consultant?.name) {
    parts.push(`Você fala em nome do consultor "${consultant.name}"${consultant.city ? ` de ${consultant.city}` : ""}. Ao mencionar telefone, use "${consultant.phone ?? "meu WhatsApp"}". Ao mencionar Instagram, use "${consultant.instagram ?? "@perfil"}".`);
  }
  return parts.join(" ");
}

/** Templates de geradores pré-configurados. */
export const TEMPLATES = {
  "post-vendas": {
    label: "Post de vendas",
    description: "Headline + corpo + CTA + hashtags",
    fields: [
      { name: "tema", label: "Tema/oferta", placeholder: "Ex.: Cobertura 24h de assistência veicular", required: true },
      { name: "publico", label: "Público-alvo", placeholder: "Ex.: motoristas de aplicativo em Volta Redonda", required: false },
    ],
    build(fields: Record<string, string>) {
      return `Crie um post de vendas para Instagram sobre: "${fields.tema}".
Público: ${fields.publico || "público geral que dirige e quer proteção veicular"}.

Formato de resposta (Markdown):
**HEADLINE:** (1 linha impactante, no máximo 60 caracteres)
**CORPO:** (3-5 frases curtas, mostrar dor + solução + prova social se possível)
**CTA:** (chamada direta com telefone/WhatsApp)
**HASHTAGS:** (5-8 hashtags relevantes, em uma linha)`;
    },
  },
  "story-sequencial": {
    label: "Sequência de Stories",
    description: "3-5 telas com narrativa progressiva",
    fields: [
      { name: "tema", label: "Tema", placeholder: "Ex.: Depoimento de cliente que teve sinistro atendido", required: true },
    ],
    build(fields: Record<string, string>) {
      return `Crie uma sequência de 4 Stories para Instagram (formato 9:16) sobre: "${fields.tema}".
Cada Story tem no máximo 12 palavras. Narrativa: abertura provocativa → dor → solução LOOG → CTA.

Formato de resposta:
**STORY 1:** [texto]
**STORY 2:** [texto]
**STORY 3:** [texto]
**STORY 4:** [texto]`;
    },
  },
  "legenda-arte": {
    label: "Legenda pra arte pronta",
    description: "Legenda que combina com uma arte publicada",
    fields: [
      { name: "descricao_arte", label: "Descreva a arte", placeholder: "Ex.: Post com carro protegido, texto 'Faça sua cotação agora'", required: true },
      { name: "objetivo", label: "Objetivo", placeholder: "Ex.: gerar mensagens no WhatsApp", required: false },
    ],
    build(fields: Record<string, string>) {
      return `Escreva uma legenda para Instagram que combine com esta arte: "${fields.descricao_arte}".
Objetivo: ${fields.objetivo || "engajar e gerar contatos"}.

Formato: 4-6 linhas, começando com hook forte, terminando com CTA + hashtags.`;
    },
  },
  "roteiro-reels": {
    label: "Roteiro de Reels (30-60s)",
    description: "Hook + desenvolvimento + CTA + trilha sugerida",
    fields: [
      { name: "tema", label: "Tema do Reels", placeholder: "Ex.: 3 motivos pra proteger seu carro hoje", required: true },
      { name: "duracao", label: "Duração alvo (segundos)", placeholder: "30", required: false },
    ],
    build(fields: Record<string, string>) {
      return `Crie um roteiro completo pra Reels do Instagram sobre: "${fields.tema}".
Duração alvo: ${fields.duracao || "30-45"}s. Formato 9:16.

Estrutura de resposta:
**HOOK (0-3s):** frase curta que segura o polegar do usuário
**DESENVOLVIMENTO (3-25s):** dividir em 2-3 blocos de 5-8s cada, um bullet por bloco
**CTA (últimos 5s):** ação clara pro espectador
**TRILHA SUGERIDA:** gênero de música ideal (ex: "beat house urbano", "trap chill")
**LEGENDA DO POST:** 2-3 linhas + hashtags`;
    },
  },
  "resposta-dm": {
    label: "Resposta pra DM/comentário",
    description: "Resposta consultiva pra mensagem de lead",
    fields: [
      { name: "mensagem_recebida", label: "Mensagem recebida", placeholder: "Cole aqui a mensagem do cliente", required: true },
      { name: "contexto", label: "Contexto extra (opcional)", placeholder: "Ex.: já conversou antes, cotou X, etc", required: false },
    ],
    build(fields: Record<string, string>) {
      return `Responda a esta mensagem de forma consultiva e humana (nada de robô):
"${fields.mensagem_recebida}"

Contexto adicional: ${fields.contexto || "primeiro contato"}.

Formato: 2-4 frases curtas, empatia + próximo passo claro. Sem emoji em excesso (máx 1-2). Nunca prometa preço sem cotar.`;
    },
  },
  "ideias-semana": {
    label: "7 ideias de posts pra semana",
    description: "Pauta variada pra 7 dias",
    fields: [
      { name: "foco", label: "Foco da semana (opcional)", placeholder: "Ex.: recrutamento, promoção Setembro, datas comemorativas" },
    ],
    build(fields: Record<string, string>) {
      return `Crie uma pauta com 7 ideias de posts pro Instagram do consultor LOOG.
Foco da semana: ${fields.foco || "misto — vendas, prova social, educacional, institucional"}.

Formato de resposta (uma linha por dia):
**SEG:** [tema] — [formato: feed/story/reel]
**TER:** ...
**QUA:** ...
**QUI:** ...
**SEX:** ...
**SÁB:** ...
**DOM:** ...`;
    },
  },
} as const;

export type TemplateKey = keyof typeof TEMPLATES;

/** Presets de imagem — cena descritiva pronta pra DALL-E 3. */
export const IMAGE_PRESETS = {
  "cena-carro-noturno": {
    label: "Cena carro premium noturno",
    description: "Automóvel em cidade à noite com iluminação azul",
    prompt: "Cinematic photograph of a luxury sedan on a wet urban street at night, dramatic blue neon reflections, city skyline in background, moody atmosphere, ultra-detailed, 4K, professional advertising photography style. Leave clear space on the top-right corner for logo placement and bottom-third for text overlay.",
  },
  "depoimento": {
    label: "Depoimento (cliente feliz)",
    description: "Pessoa satisfeita ao lado do carro",
    prompt: "Warm photograph of a happy Brazilian client (male or female, mid-30s, casual clothing) smiling next to their car in a residential street during golden hour. Genuine expression, natural lighting, shallow depth of field. Empty space in the upper-third for headline text. Photorealistic, editorial style.",
  },
  "recrutamento": {
    label: "Recrutamento de consultor",
    description: "Pessoa profissional confiante com cenário corporativo moderno",
    prompt: "Professional portrait of a confident Brazilian entrepreneur in modern business casual attire, standing in a bright modern office with dark blue accents, subtle city view through window, hopeful and successful vibe. Leave upper 40% of frame empty for headline text. Editorial marketing photography, 4K.",
  },
  "datas-comemorativas": {
    label: "Data comemorativa (genérica)",
    description: "Composição festiva neutra pra sobrepor texto",
    prompt: "Elegant flat lay composition with soft blue and white color palette, subtle celebratory elements (small ribbon, geometric shapes), minimal aesthetic, plenty of negative space in center for typographic overlay. Studio lighting, sharp focus, luxury advertising style.",
  },
} as const;

export type ImagePresetKey = keyof typeof IMAGE_PRESETS;
